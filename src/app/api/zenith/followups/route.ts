import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { followupSequences } from '@/lib/db/schema/followups';
import { eq, desc } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { apiErrorResponse } from '@/lib/api/error-response';
import { z } from 'zod';

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  triggerType: z.string().min(1),
  status: z.enum(['draft', 'active', 'paused', 'archived']).default('draft'),
  cancelOnReply: z.boolean().default(true),
  cancelOnDealClosed: z.boolean().default(true),
  timeZone: z.string().default('America/Sao_Paulo'),
  quietHoursStart: z.string().optional().nullable(),
  quietHoursEnd: z.string().optional().nullable(),
  conditions: z.array(z.any()).default([]),
  steps: z.array(z.any()).default([]),
});

export async function GET(req: Request) {
  try {
    const { accountId } = await requireZenithRole('agent');
    const sequences = await db.select()
      .from(followupSequences)
      .where(eq(followupSequences.accountId, accountId))
      .orderBy(desc(followupSequences.updatedAt));
    
    return NextResponse.json(sequences);
  } catch (error: unknown) {
    return apiErrorResponse(error, '[GET /api/zenith/followups]');
  }
}

export async function POST(req: Request) {
  try {
    const { accountId, userId } = await requireZenithRole('admin');
    const body = await req.json();
    
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error }, { status: 400 });
    }

    const [newSequence] = await db.insert(followupSequences).values({
      accountId,
      createdByUserId: userId,
      ...parsed.data,
    }).returning();

    return NextResponse.json(newSequence);
  } catch (error: unknown) {
    return apiErrorResponse(error, '[POST /api/zenith/followups]');
  }
}
