import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { automationRuns, automationActionRuns, automationVersions } from '@/lib/db/schema/automations';
import { eq, and, desc } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { apiErrorResponse } from '@/lib/api/error-response';

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const { accountId } = await requireZenithRole('agent');
    
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const page = parseInt(url.searchParams.get('page') || '1');
    const offset = (page - 1) * limit;

    const runs = await db.select({
      id: automationRuns.id,
      status: automationRuns.status,
      triggerType: automationRuns.triggerType,
      triggerEventId: automationRuns.triggerEventId,
      entityType: automationRuns.entityType,
      entityId: automationRuns.entityId,
      errorCode: automationRuns.errorCode,
      startedAt: automationRuns.startedAt,
      completedAt: automationRuns.completedAt,
      failedAt: automationRuns.failedAt,
      version: automationVersions.version,
    })
      .from(automationRuns)
      .innerJoin(automationVersions, eq(automationRuns.automationVersionId, automationVersions.id))
      .where(and(eq(automationRuns.automationId, id), eq(automationRuns.accountId, accountId)))
      .orderBy(desc(automationRuns.startedAt))
      .limit(limit)
      .offset(offset);

    // Fetch actions for the returned runs
    if (runs.length > 0) {
      const runIds = runs.map(r => r.id);
      
      // We do it manually since Drizzle doesn't have an easy WHERE IN without sql tag if not mapped properly, or we can use or()
      // Let's just fetch all and group
      const allActions: any[] = [];
      for (const run of runs) {
        const actionRuns = await db.select()
          .from(automationActionRuns)
          .where(eq(automationActionRuns.automationRunId, run.id))
          .orderBy(automationActionRuns.actionIndex);
        
        allActions.push(...actionRuns);
      }
      
      const runsWithActions = runs.map(run => ({
        ...run,
        actions: allActions.filter(a => a.automationRunId === run.id)
      }));
      
      return NextResponse.json(runsWithActions);
    }

    return NextResponse.json([]);
  } catch (error: unknown) {
    return apiErrorResponse(error, '[GET /api/zenith/automations/:id/history]');
  }
}
