import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { followupSequences, followupSequenceVersions } from '@/lib/db/schema/followups';
import { eq, and } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { apiErrorResponse } from '@/lib/api/error-response';

type FollowupPublishRouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, { params }: FollowupPublishRouteContext) {
  const { id } = await params;

  try {
    const { accountId, userId } = await requireZenithRole('admin');
    
    // 1. Get the draft sequence
    const [sequence] = await db.select()
      .from(followupSequences)
      .where(and(
        eq(followupSequences.id, id),
        eq(followupSequences.accountId, accountId)
      ))
      .limit(1);

    if (!sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    if (sequence.status === 'archived') {
      return NextResponse.json({ error: 'Cannot publish archived sequence' }, { status: 400 });
    }

    // 2. Find latest version number
    const versions = await db.select({ version: followupSequenceVersions.version })
      .from(followupSequenceVersions)
      .where(eq(followupSequenceVersions.sequenceId, sequence.id))
      .orderBy(followupSequenceVersions.version);
    
    const nextVersionNum = versions.length > 0 ? Math.max(...versions.map(v => v.version)) + 1 : 1;

    // 3. Create new published version
    const [newVersion] = await db.insert(followupSequenceVersions).values({
      sequenceId: sequence.id,
      version: nextVersionNum,
      triggerType: sequence.triggerType,
      conditions: sequence.conditions,
      steps: sequence.steps,
      cancelOnReply: sequence.cancelOnReply,
      cancelOnDealClosed: sequence.cancelOnDealClosed,
      timeZone: sequence.timeZone,
      quietHoursStart: sequence.quietHoursStart,
      quietHoursEnd: sequence.quietHoursEnd,
      createdByUserId: userId,
    }).returning();

    // 4. Link back to sequence and set to active
    const [updatedSequence] = await db.update(followupSequences)
      .set({
        publishedVersionId: newVersion.id,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(and(
        eq(followupSequences.id, sequence.id),
        eq(followupSequences.accountId, accountId)
      ))
      .returning();

    return NextResponse.json({
      success: true,
      sequence: updatedSequence,
      publishedVersion: newVersion
    });

  } catch (error: unknown) {
    return apiErrorResponse(error, `[POST /api/zenith/followups/${id}/publish]`);
  }
}
