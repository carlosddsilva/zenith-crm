import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { automationRuns } from '@/lib/db/schema/automations';
import { eq, and, desc } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { apiErrorResponse } from '@/lib/api/error-response';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { accountId } = await requireZenithRole('agent');
    const runs = await db.query.automationRuns.findMany({
      where: and(
        eq(automationRuns.accountId, accountId),
        eq(automationRuns.automationId, id)
      ),
      orderBy: [desc(automationRuns.startedAt)],
      limit: 100,
    });

    return NextResponse.json(runs);
  } catch (error) {
    return apiErrorResponse(error, '[GET /api/zenith/automations/[id]/logs]');
  }
}
