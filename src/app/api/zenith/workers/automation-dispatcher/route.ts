import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { automations, automationRuns, automationActionRuns, automationVersions } from '@/lib/db/schema/automations';
import { followupSequences, followupSequenceVersions, followupEnrollments, followupEnrollmentSteps } from '@/lib/db/schema/followups';
import { automationEventsOutbox } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { evaluateConditions, executeAction } from '@/lib/automations/engine';
import { cancelActiveEnrollments, calculateNextStepAt } from '@/lib/followups/engine';
import { AutomationCondition, AutomationAction, AutomationTriggerType } from '@/types';
import { verifyWorkerRequest } from '@/lib/workers/auth';
import { randomUUID } from 'crypto';

export async function POST(req: Request) {
  try {
    const auth = verifyWorkerRequest(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
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

    // 1. Cancellation Hooks for Follow-ups
    if (triggerType === 'message.received' && payload.contactId) {
      await cancelActiveEnrollments(accountId, 'customer_replied', payload.contactId);
    } else if ((triggerType === 'deal.won' || triggerType === 'deal.lost') && payload.deal?.id) {
      await cancelActiveEnrollments(accountId, 'deal_closed', undefined, payload.deal.id);
    }

    // SLA Handlers
    if (triggerType === 'conversation.sla_started') {
      const convId = payload.conversationId;
      const { slaPolicies } = await import('@/lib/db/schema/sla');
      // Fetch default policy
      const [policy] = await db.select().from(slaPolicies)
        .where(and(eq(slaPolicies.accountId, accountId), eq(slaPolicies.isActive, true)))
        .orderBy(slaPolicies.id)
        .limit(1);

      const warnMinutes = policy ? policy.warningThresholdMinutes : 15;
      const overdueMinutes = policy ? policy.overdueThresholdMinutes : 60;
      
      const { calculateNextStepAt } = await import('@/lib/followups/engine');
      const timeZone = policy?.timeZone || 'America/Sao_Paulo';
      
      const warnAt = calculateNextStepAt(warnMinutes, timeZone, policy?.businessHoursStart || null, policy?.businessHoursEnd || null);
      const overdueAt = calculateNextStepAt(overdueMinutes, timeZone, policy?.businessHoursStart || null, policy?.businessHoursEnd || null);

      await db.insert(automationEventsOutbox).values([
        {
          eventId: randomUUID(),
          accountId,
          eventType: 'conversation.sla_breach_check',
          aggregateId: convId,
          aggregateType: 'conversation',
          payload: { conversationId: convId, checkType: 'warning', originalStartAt: new Date() },
          depth: 0,
          status: 'pending',
          nextAttemptAt: warnAt,
        },
        {
          eventId: randomUUID(),
          accountId,
          eventType: 'conversation.sla_breach_check',
          aggregateId: convId,
          aggregateType: 'conversation',
          payload: { conversationId: convId, checkType: 'overdue', originalStartAt: new Date() },
          depth: 0,
          status: 'pending',
          nextAttemptAt: overdueAt,
        }
      ]);
    }

    if (triggerType === 'conversation.sla_breach_check') {
      const convId = payload.conversationId;
      const checkType = payload.checkType; // 'warning' | 'overdue'
      const { conversations } = await import('@/lib/db/schema/inbox');
      
      const [conv] = await db.select().from(conversations).where(and(eq(conversations.id, convId), eq(conversations.accountId, accountId))).limit(1);
      
      // se nao existe, ja foi fechada, ou se o SLA foi limpo (firstUnrepliedMessageAt == null)
      if (!conv || !conv.firstUnrepliedMessageAt || conv.status !== 'open') {
        return NextResponse.json({ success: true, executed: 0, reason: 'disarmed' });
      }

      const newStatus = checkType === 'overdue' ? 'overdue' : 'warning';
      
      // se já está overdue, não faz downgrade para warning
      if (!(conv.slaStatus === 'overdue' && checkType === 'warning')) {
        await db.update(conversations).set({ 
          slaStatus: newStatus,
          lastSlaBreachAt: new Date(),
          updatedAt: new Date() 
        }).where(eq(conversations.id, convId));

        // Transmitir evento p/ o Motor de Automações (ZC-07)
        const { publishEvent } = await import('@/lib/events/bus');
        await publishEvent(db as any, {
          accountId,
          triggerType: 'conversation.sla_breached',
          entityType: 'conversation',
          entityId: convId,
          payload: { conversationId: convId, checkType, contactId: conv.contactId }
        });
      }
      return NextResponse.json({ success: true, executed: 1 });
    }

    // 2. Execute Follow-up Step Trigger
    if (triggerType === 'followup.execute_step') {
      const enrollmentId = entityId; // we passed enrollmentId as aggregateId
      if (!enrollmentId) return NextResponse.json({ success: true, executed: 0 });

      const [enrollment] = await db.select().from(followupEnrollments)
        .where(and(eq(followupEnrollments.id, enrollmentId), eq(followupEnrollments.accountId, accountId)))
        .limit(1);

      if (!enrollment || enrollment.status !== 'active') {
        return NextResponse.json({ success: true, executed: 0, reason: 'inactive_or_not_found' });
      }

      const [version] = await db.select().from(followupSequenceVersions)
        .where(eq(followupSequenceVersions.id, enrollment.versionId)).limit(1);

      if (!version) return NextResponse.json({ success: false, error: 'version_not_found' });

      const steps = version.steps as any[];
      const stepIndex = enrollment.currentStepIndex;
      if (stepIndex >= steps.length) {
        await db.update(followupEnrollments).set({ status: 'completed', updatedAt: new Date() }).where(eq(followupEnrollments.id, enrollment.id));
        return NextResponse.json({ success: true, executed: 0, reason: 'already_completed' });
      }

      const stepConfig = steps[stepIndex];

      // Execute Action
      const result = await executeAction(stepConfig.action, {
        accountId,
        automationId: version.sequenceId, // Using sequenceId here
        automationOwnerUserId: version.createdByUserId,
        runId: enrollment.id,
        payload: payload.originalPayload || {}, // Keep original payload if possible, or just empty
        depth: depth || 0,
      });

      if (result.success) {
        const nextStepIndex = stepIndex + 1;
        if (nextStepIndex >= steps.length) {
          await db.update(followupEnrollments).set({ currentStepIndex: nextStepIndex, status: 'completed', updatedAt: new Date() }).where(eq(followupEnrollments.id, enrollment.id));
        } else {
          // Schedule next
          const nextStepConfig = steps[nextStepIndex];
          const nextStepAt = calculateNextStepAt(nextStepConfig.delayMinutes || 0, version.timeZone, version.quietHoursStart, version.quietHoursEnd);
          
          await db.update(followupEnrollments).set({ currentStepIndex: nextStepIndex, nextStepAt, updatedAt: new Date() }).where(eq(followupEnrollments.id, enrollment.id));
          
          await db.insert(automationEventsOutbox).values({
            eventId: randomUUID(),
            accountId,
            eventType: 'followup.execute_step',
            aggregateId: enrollment.id,
            aggregateType: 'enrollment',
            payload: payload,
            depth: depth || 0,
            status: 'pending',
            nextAttemptAt: nextStepAt,
          });
        }
      } else {
        await db.update(followupEnrollments).set({ status: 'failed', cancelReason: result.error, updatedAt: new Date() }).where(eq(followupEnrollments.id, enrollment.id));
      }

      return NextResponse.json({ success: true, executed: 1 });
    }

    // 3. Process Standard Automations
    let executedCount = 0;
    
    const matchingAutomations = await db.select({ automation: automations, version: automationVersions })
      .from(automations)
      .innerJoin(automationVersions, eq(automations.publishedVersionId, automationVersions.id))
      .where(and(eq(automations.accountId, accountId), eq(automations.status, 'active'), eq(automations.triggerType, triggerType)));

    for (const match of matchingAutomations) {
      const { automation, version } = match;
      if (!evaluateConditions(version.conditions as AutomationCondition[], payload)) continue;

      let run;
      let existingActionRuns: any[] = [];
      let isResume = false;

      try {
        const [insertedRun] = await db.insert(automationRuns).values({
          accountId, automationId: automation.id, automationVersionId: version.id, triggerType: automation.triggerType,
          triggerEventId: eventId, entityType: entityType || null, entityId: entityId || null, status: 'running',
        }).returning();
        run = insertedRun;
      } catch (err: any) {
        if (err.code === '23505') {
          const [existingRun] = await db.select().from(automationRuns).where(and(eq(automationRuns.automationId, automation.id), eq(automationRuns.triggerEventId, eventId))).limit(1);
          if (!existingRun || existingRun.status === 'completed' || existingRun.status === 'running') continue;
          isResume = true;
          run = existingRun;
          await db.update(automationRuns).set({ status: 'running' }).where(eq(automationRuns.id, run.id));
          existingActionRuns = await db.select().from(automationActionRuns).where(eq(automationActionRuns.automationRunId, run.id));
        } else throw err;
      }

      executedCount++;
      const actions = version.actions as AutomationAction[];
      let runFailed = false;

      for (let i = 0; i < actions.length; i++) {
        if (isResume && existingActionRuns.find(ar => ar.actionIndex === i)?.status === 'completed') continue;
        let actionRun;
        const existingActionRun = isResume ? existingActionRuns.find(ar => ar.actionIndex === i) : null;
        if (existingActionRun) {
          [actionRun] = await db.update(automationActionRuns).set({ status: 'running', errorCode: null, startedAt: new Date(), failedAt: null }).where(eq(automationActionRuns.id, existingActionRun.id)).returning();
        } else {
          [actionRun] = await db.insert(automationActionRuns).values({ automationRunId: run.id, actionIndex: i, actionType: actions[i].type, status: 'running' }).returning();
        }

        const result = await executeAction(actions[i], { accountId, automationId: automation.id, automationOwnerUserId: version.createdByUserId, runId: run.id, payload, depth: depth || 0 });

        await db.update(automationActionRuns).set({ status: result.success ? 'completed' : 'failed', errorCode: result.error || null, completedAt: result.success ? new Date() : null, failedAt: result.success ? null : new Date() }).where(eq(automationActionRuns.id, actionRun.id));
        if (!result.success) { runFailed = true; break; }
      }

      await db.update(automationRuns).set({ status: runFailed ? 'failed' : 'completed', completedAt: runFailed ? null : new Date(), failedAt: runFailed ? new Date() : null }).where(eq(automationRuns.id, run.id));
    }

    // 4. Process Follow-up Sequence Enrollments
    const contactId = payload.contact?.id || payload.contactId;
    if (contactId) {
      const matchingSequences = await db.select({ sequence: followupSequences, version: followupSequenceVersions })
        .from(followupSequences)
        .innerJoin(followupSequenceVersions, eq(followupSequences.publishedVersionId, followupSequenceVersions.id))
        .where(and(eq(followupSequences.accountId, accountId), eq(followupSequences.status, 'active'), eq(followupSequences.triggerType, triggerType)));

      for (const match of matchingSequences) {
        const { sequence, version } = match;
        if (!evaluateConditions(version.conditions as AutomationCondition[], payload)) continue;

        const steps = version.steps as any[];
        if (steps.length === 0) continue;

        try {
          const nextStepAt = calculateNextStepAt(steps[0].delayMinutes || 0, version.timeZone, version.quietHoursStart, version.quietHoursEnd);
          
          const [enrollment] = await db.insert(followupEnrollments).values({
            accountId, sequenceId: sequence.id, versionId: version.id, contactId, dealId: payload.deal?.id,
            triggerEventId: eventId, currentStepIndex: 0, nextStepAt, status: 'active',
          }).returning();

          await db.insert(automationEventsOutbox).values({
            eventId: randomUUID(),
            accountId,
            eventType: 'followup.execute_step',
            aggregateId: enrollment.id,
            aggregateType: 'enrollment',
            payload: { originalPayload: payload },
            depth: depth || 0,
            status: 'pending',
            nextAttemptAt: nextStepAt,
          });
          executedCount++;
        } catch (err: any) {
          if (err.code !== '23505') throw err;
        }
      }
    }

    return NextResponse.json({ success: true, executed: executedCount });
  } catch (error: unknown) {
    console.error('[AutomationDispatcher] failed', {
      errorCode: error instanceof Error ? error.name : 'UnknownError',
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
