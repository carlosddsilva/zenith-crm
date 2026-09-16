import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { automations } from '@/lib/db/schema/automations';
import { eq, and } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { apiErrorResponse } from '@/lib/api/error-response';
import { evaluateConditions, executeAction } from '@/lib/automations/engine';
import { AutomationCondition, AutomationAction } from '@/types';

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const { accountId, userId } = await requireZenithRole('admin');
    
    const body = await req.json();
    const payload = body.payload || {};

    const [automation] = await db.select()
      .from(automations)
      .where(and(eq(automations.id, id), eq(automations.accountId, accountId)))
      .limit(1);

    if (!automation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const conditions = automation.conditions as AutomationCondition[];
    const actions = automation.actions as AutomationAction[];
    
    const shouldRun = evaluateConditions(conditions, payload);
    
    if (!shouldRun) {
      return NextResponse.json({ success: true, evaluated: true, ran: false, reason: 'Conditions not met' });
    }

    const results = [];
    let runFailed = false;

    // Execute in dry-run mode
    for (const action of actions) {
      const result = await executeAction(action, {
        accountId,
        automationId: automation.id,
        automationOwnerUserId: userId,
        runId: 'dry-run-' + Date.now(),
        payload,
        depth: 0,
        dryRun: true,
      });

      results.push({ action: action.type, success: result.success, error: result.error });

      if (!result.success) {
        runFailed = true;
        break;
      }
    }

    return NextResponse.json({ success: true, evaluated: true, ran: true, runFailed, results });
  } catch (error: unknown) {
    return apiErrorResponse(error, '[POST /api/zenith/automations/:id/test]');
  }
}
