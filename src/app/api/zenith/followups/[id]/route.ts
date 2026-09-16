import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { followupSequences } from '@/lib/db/schema/followups';
import { eq, and } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { apiErrorResponse } from '@/lib/api/error-response';
import { z } from 'zod';

const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional().nullable(),
  triggerType: z.string().optional(),
  status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
  cancelOnReply: z.boolean().optional(),
  cancelOnDealClosed: z.boolean().optional(),
  timeZone: z.string().optional(),
  quietHoursStart: z.string().optional().nullable(),
  quietHoursEnd: z.string().optional().nullable(),
  conditions: z.array(z.any()).optional(),
  steps: z.array(z.any()).optional(),
});

type FollowupRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: Request, { params }: FollowupRouteContext) {
  const { id } = await params;

  try {
    const { accountId } = await requireZenithRole('agent');
    const [sequence] = await db.select()
      .from(followupSequences)
      .where(and(
        eq(followupSequences.id, id),
        eq(followupSequences.accountId, accountId)
      ))
      .limit(1);

    if (!sequence) return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    return NextResponse.json(sequence);
  } catch (error: unknown) {
    return apiErrorResponse(error, `[GET /api/zenith/followups/${id}]`);
  }
}

export async function PATCH(req: Request, { params }: FollowupRouteContext) {
  const { id } = await params;

  try {
    const { accountId } = await requireZenithRole('admin');
    const body = await req.json();

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error }, { status: 400 });

    const [sequence] = await db.select().from(followupSequences)
      .where(and(eq(followupSequences.id, id), eq(followupSequences.accountId, accountId)))
      .limit(1);

    if (!sequence) return NextResponse.json({ error: 'Not Found' }, { status: 404 });

    const [updated] = await db.update(followupSequences)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(followupSequences.id, id), eq(followupSequences.accountId, accountId)))
      .returning();

    return NextResponse.json(updated);
  } catch (error: unknown) {
    return apiErrorResponse(error, `[PATCH /api/zenith/followups/${id}]`);
  }
}

export async function DELETE(req: Request, { params }: FollowupRouteContext) {
  const { id } = await params;

  try {
    const { accountId } = await requireZenithRole('admin');

    const [sequence] = await db.select().from(followupSequences)
      .where(and(eq(followupSequences.id, id), eq(followupSequences.accountId, accountId)))
      .limit(1);

    if (!sequence) return NextResponse.json({ error: 'Not Found' }, { status: 404 });

    await db.delete(followupSequences)
      .where(and(eq(followupSequences.id, id), eq(followupSequences.accountId, accountId)));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return apiErrorResponse(error, `[DELETE /api/zenith/followups/${id}]`);
  }
}
