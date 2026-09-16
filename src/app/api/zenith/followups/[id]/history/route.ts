import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { followupEnrollments } from '@/lib/db/schema/followups';
import { contacts } from '@/lib/db/schema/contacts';
import { eq, and, desc } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { apiErrorResponse } from '@/lib/api/error-response';

type FollowupHistoryRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: Request, { params }: FollowupHistoryRouteContext) {
  const { id } = await params;

  try {
    const { accountId } = await requireZenithRole('agent');
    
    // Fetch recent 50 enrollments for this sequence
    const history = await db.select({
      enrollment: followupEnrollments,
      contact: contacts
    })
      .from(followupEnrollments)
      .leftJoin(contacts, eq(followupEnrollments.contactId, contacts.id))
      .where(and(
        eq(followupEnrollments.sequenceId, id),
        eq(followupEnrollments.accountId, accountId)
      ))
      .orderBy(desc(followupEnrollments.enrolledAt))
      .limit(50);

    return NextResponse.json(history.map(row => ({
      id: row.enrollment.id,
      contactId: row.contact?.id,
      contactName: row.contact?.name,
      contactPhone: row.contact?.phone,
      status: row.enrollment.status,
      currentStepIndex: row.enrollment.currentStepIndex,
      cancelReason: row.enrollment.cancelReason,
      enrolledAt: row.enrollment.enrolledAt,
      nextStepAt: row.enrollment.nextStepAt,
    })));
  } catch (error: unknown) {
    return apiErrorResponse(error, `[GET /api/zenith/followups/${id}/history]`);
  }
}
