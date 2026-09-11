import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { automations, automationRuns, automationActionRuns } from '@/lib/db/schema/automations';
import { eq, and } from 'drizzle-orm';
import { evaluateConditions, executeAction } from '@/lib/automations/engine';
import { AutomationCondition, AutomationAction, AutomationTriggerType } from '@/types';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('x-zenith-worker-token');
    if (authHeader !== (process.env.ZENITH_WORKER_SECRET || 'dev-secret')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { accountId, triggerType, eventId, entityType, entityId, payload, depth } = body;

    if (!accountId || !triggerType || !eventId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (depth && depth > 3) {
      console.warn(`[AutomationDispatcher] Max depth (3) exceeded for event ${eventId}`);
      return NextResponse.json({ error: 'Max depth exceeded' }, { status: 400 });
    }

    // 1. Fetch matching active automations
    const matchingAutomations = await db.select()
      .from(automations)
      .where(and(
        eq(automations.accountId, accountId),
        eq(automations.status, 'active'),
        eq(automations.triggerType, triggerType as AutomationTriggerType)
      ));

    if (matchingAutomations.length === 0) {
      return NextResponse.json({ success: true, executed: 0 });
    }

    let executedCount = 0;

    // 2. Iterate over automations and evaluate
    for (const automation of matchingAutomations) {
      // Evaluate conditions
      const shouldRun = evaluateConditions(automation.conditions as AutomationCondition[], payload);
      if (!shouldRun) continue;

      // Create Run (Idempotency check via unique constraint on automationId + triggerEventId)
      let run;
      try {
        const [insertedRun] = await db.insert(automationRuns).values({
          accountId,
          automationId: automation.id,
          triggerType: automation.triggerType,
          triggerEventId: eventId,
          entityType: entityType || null,
          entityId: entityId || null,
          status: 'running',
        }).returning();
        run = insertedRun;
      } catch (err: any) {
        // Unique constraint violation (23505 in pg) means this event was already processed for this automation
        if (err.code === '23505') {
          console.log(`[AutomationDispatcher] Skipping duplicate event ${eventId} for automation ${automation.id}`);
          continue;
        }
        throw err;
      }

      executedCount++;

      // Execute actions
      const actions = automation.actions as AutomationAction[];
      let runFailed = false;

      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const [actionRun] = await db.insert(automationActionRuns).values({
          automationRunId: run.id,
          actionIndex: i,
          actionType: action.type,
          status: 'running',
        }).returning();

        const result = await executeAction(action, {
          accountId,
          automationId: automation.id,
          runId: run.id,
          payload,
          depth: depth || 0,
        });

        await db.update(automationActionRuns)
          .set({
            status: result.success ? 'completed' : 'failed',
            errorCode: result.error || null,
            completedAt: result.success ? new Date() : null,
            failedAt: result.success ? null : new Date(),
          })
          .where(eq(automationActionRuns.id, actionRun.id));

        if (!result.success) {
          runFailed = true;
          // Stop execution on first failure for MVP, or continue depending on requirements
          break;
        }
      }

      // Update Run Status
      await db.update(automationRuns)
        .set({
          status: runFailed ? 'failed' : 'completed',
          completedAt: runFailed ? null : new Date(),
          failedAt: runFailed ? new Date() : null,
        })
        .where(eq(automationRuns.id, run.id));
    }

    return NextResponse.json({ success: true, executed: executedCount });
  } catch (error: any) {
    console.error('[AutomationDispatcher] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
