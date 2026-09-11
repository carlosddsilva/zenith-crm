import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { automationRuns } from '@/lib/db/schema/automations';
import { eq, and, desc } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { accountId } = await requireZenithRole('agent');
    if (!accountId) return new NextResponse('Unauthorized', { status: 401 });

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
    console.error('Failed to fetch automation logs:', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}
