import { db } from '@/lib/db/client';
import { followupEnrollments, followupSequences } from '@/lib/db/schema/followups';
import { eq, and, inArray } from 'drizzle-orm';

/**
 * Calculates the next valid execution time considering the delay and quiet hours in the target timezone.
 * Uses native Intl API for timezone offsets since we don't have date-fns-tz.
 */
export function calculateNextStepAt(
  delayMinutes: number,
  timeZone: string,
  quietHoursStart?: string | null,
  quietHoursEnd?: string | null
): Date {
  // Start with the base time
  const targetTime = new Date(Date.now() + delayMinutes * 60000);
  
  if (!quietHoursStart || !quietHoursEnd) {
    return targetTime;
  }

  // A very basic check: we use Intl to format the targetTime in the specific timezone
  // to check its local hour and minute.
  const options: Intl.DateTimeFormatOptions = { 
    timeZone, 
    hour: 'numeric', 
    minute: 'numeric', 
    hour12: false 
  };
  
  const formatter = new Intl.DateTimeFormat('en-US', options);
  
  // Format returns "HH:MM" 
  // Note: some browsers might return 24:00 instead of 00:00, so we split and parse safely
  const parts = formatter.format(targetTime).split(':');
  const targetHour = parseInt(parts[0], 10) % 24;
  const targetMinute = parseInt(parts[1], 10);
  
  const [startHourStr, startMinuteStr] = quietHoursStart.split(':');
  const startHour = parseInt(startHourStr, 10);
  const startMinute = parseInt(startMinuteStr || '0', 10);
  
  const [endHourStr, endMinuteStr] = quietHoursEnd.split(':');
  const endHour = parseInt(endHourStr, 10);
  const endMinute = parseInt(endMinuteStr || '0', 10);

  // Convert everything to minutes from midnight for easy comparison
  const targetTotalMins = targetHour * 60 + targetMinute;
  const startTotalMins = startHour * 60 + startMinute;
  const endTotalMins = endHour * 60 + endMinute;

  let isInQuietHours = false;

  if (startTotalMins > endTotalMins) {
    // Crosses midnight (e.g. 20:00 to 08:00)
    if (targetTotalMins >= startTotalMins || targetTotalMins < endTotalMins) {
      isInQuietHours = true;
    }
  } else {
    // Same day (e.g. 02:00 to 06:00)
    if (targetTotalMins >= startTotalMins && targetTotalMins < endTotalMins) {
      isInQuietHours = true;
    }
  }

  if (isInQuietHours) {
    // Push the target time to the end of quiet hours.
    // For simplicity, we just add the difference in minutes until the end hour.
    let minsToWait = 0;
    if (targetTotalMins < endTotalMins) {
      minsToWait = endTotalMins - targetTotalMins;
    } else {
      minsToWait = (24 * 60 - targetTotalMins) + endTotalMins;
    }
    
    return new Date(targetTime.getTime() + minsToWait * 60000);
  }

  return targetTime;
}

/**
 * Cancels active enrollments if the customer replied or deal closed, 
 * depending on the sequence configuration.
 */
export async function cancelActiveEnrollments(
  accountId: string,
  reason: 'customer_replied' | 'deal_closed' | 'manual' | 'opt_out',
  contactId?: string,
  dealId?: string
) {
  if (!contactId && !dealId) return;

  const whereConditions = [
    eq(followupEnrollments.accountId, accountId),
    eq(followupEnrollments.status, 'active')
  ];

  if (contactId) {
    whereConditions.push(eq(followupEnrollments.contactId, contactId));
  } else if (dealId) {
    whereConditions.push(eq(followupEnrollments.dealId, dealId));
  }

  const activeEnrollments = await db.select({
    id: followupEnrollments.id,
    sequenceId: followupEnrollments.sequenceId
  })
    .from(followupEnrollments)
    .where(and(...whereConditions));

  if (activeEnrollments.length === 0) return;

  const sequenceIds = activeEnrollments.map(e => e.sequenceId);
  const uniqueSeqIds = [...new Set(sequenceIds)];

  const sequences = await db.select({
    id: followupSequences.id,
    cancelOnReply: followupSequences.cancelOnReply,
    cancelOnDealClosed: followupSequences.cancelOnDealClosed
  })
    .from(followupSequences)
    .where(inArray(followupSequences.id, uniqueSeqIds));

  const seqMap = new Map(sequences.map(s => [s.id, s]));

  const enrollmentsToCancel = activeEnrollments.filter(e => {
    const seq = seqMap.get(e.sequenceId);
    if (!seq) return false;
    if (reason === 'customer_replied' || reason === 'opt_out') {
      return seq.cancelOnReply;
    }
    if (reason === 'deal_closed') {
      return seq.cancelOnDealClosed;
    }
    return true; // manual cancels always apply
  });

  if (enrollmentsToCancel.length === 0) return;

  const idsToCancel = enrollmentsToCancel.map(e => e.id);

  await db.update(followupEnrollments)
    .set({
      status: 'cancelled',
      cancelReason: reason,
      updatedAt: new Date(),
    })
    .where(inArray(followupEnrollments.id, idsToCancel));
    
  console.log(`[FollowupsEngine] Cancelled ${idsToCancel.length} enrollments due to ${reason}.`);
}
