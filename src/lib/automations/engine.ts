import { AutomationCondition, AutomationAction } from '@/types';
import { db } from '@/lib/db/client';
import { eq, and } from 'drizzle-orm';
import { publishEvent } from '@/lib/events/bus';

// ----------------------------------------------------------------------------
// Conditions Evaluator
// ----------------------------------------------------------------------------

export function evaluateConditions(
  conditions: AutomationCondition[],
  payload: Record<string, any>
): boolean {
  if (!conditions || conditions.length === 0) return true;

  for (const condition of conditions) {
    const fieldValue = getNestedValue(payload, condition.field);

    switch (condition.operator) {
      case 'equals':
        if (fieldValue != condition.value) return false;
        break;
      case 'not_equals':
        if (fieldValue == condition.value) return false;
        break;
      case 'contains':
        if (typeof fieldValue !== 'string' || !fieldValue.includes(String(condition.value))) return false;
        break;
      case 'is_empty':
        if (fieldValue !== null && fieldValue !== undefined && fieldValue !== '') return false;
        break;
      case 'is_not_empty':
        if (fieldValue === null || fieldValue === undefined || fieldValue === '') return false;
        break;
      default:
        return false;
    }
  }

  return true;
}

function getNestedValue(obj: any, path: string): any {
  if (path.includes('__proto__') || path.includes('constructor') || path.includes('prototype')) {
    return undefined; // Block prototype pollution/unsafe access
  }
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

// ----------------------------------------------------------------------------
// Actions Executor
// ----------------------------------------------------------------------------

export interface ActionExecutionContext {
  accountId: string;
  automationId: string;
  runId: string;
  payload: Record<string, any>;
  depth: number;
}

export async function executeAction(
  action: AutomationAction,
  context: ActionExecutionContext
): Promise<{ success: boolean; error?: string }> {
  try {
    switch (action.type) {
      case 'contact.add_tag':
        return await executeAddTag(action.params, context);
      case 'contact.remove_tag':
        return await executeRemoveTag(action.params, context);
      case 'deal.move_stage':
        return await executeMoveDealStage(action.params, context);
      case 'task.create':
        return await executeCreateTask(action.params, context);
      case 'task.complete':
        return await executeCompleteTask(action.params, context);
      case 'note.create':
        return await executeCreateNote(action.params, context);
      case 'send_message':
        return await executeSendMessage(action.params, context);
      default:
        return { success: false, error: `Unknown action type: ${action.type}` };
    }
  } catch (error: any) {
    console.error(`[AutomationEngine] Action failed: ${action.type}`, error);
    return { success: false, error: error.message };
  }
}

// -- Action Implementations (MVPs) --

async function executeAddTag(params: Record<string, any>, context: ActionExecutionContext) {
  const contactId = context.payload.contact?.id || context.payload.deal?.contactId;
  const tagId = params.tagId;
  if (!contactId || !tagId) return { success: false, error: 'Missing contactId or tagId' };

  const { contactTags } = await import('@/lib/db/schema');
  await db.insert(contactTags).values({ contactId, tagId }).onConflictDoNothing();
  return { success: true };
}

async function executeRemoveTag(params: Record<string, any>, context: ActionExecutionContext) {
  const contactId = context.payload.contact?.id || context.payload.deal?.contactId;
  const tagId = params.tagId;
  if (!contactId || !tagId) return { success: false, error: 'Missing contactId or tagId' };

  const { contactTags } = await import('@/lib/db/schema');
  await db.delete(contactTags).where(and(eq(contactTags.contactId, contactId), eq(contactTags.tagId, tagId)));
  return { success: true };
}

async function executeMoveDealStage(params: Record<string, any>, context: ActionExecutionContext) {
  const dealId = context.payload.deal?.id;
  const stageId = params.stageId;
  if (!dealId || !stageId) return { success: false, error: 'Missing dealId or stageId' };

  const { deals } = await import('@/lib/db/schema/pipeline');
  const [updated] = await db.update(deals).set({ stageId, updatedAt: new Date() }).where(eq(deals.id, dealId)).returning();
  
  // Publish event to trigger cascading automations
  if (updated) {
    publishEvent({
      accountId: context.accountId,
      triggerType: 'deal.stage_changed',
      entityType: 'deal',
      entityId: updated.id,
      payload: { deal: updated },
      depth: context.depth + 1,
    });
  }
  
  return { success: true };
}

async function executeCreateTask(params: Record<string, any>, context: ActionExecutionContext) {
  const { tasks } = await import('@/lib/db/schema/activities');
  const contactId = context.payload.contact?.id || context.payload.deal?.contactId || null;
  const dealId = context.payload.deal?.id || null;
  
  await db.insert(tasks).values({
    accountId: context.accountId,
    createdByUserId: params.assignedUserId || null,
    assignedUserId: params.assignedUserId || null,
    title: params.title || 'Automated Task',
    description: params.description || null,
    contactId,
    dealId,
    status: 'pending',
    priority: params.priority || 'normal',
    dueAt: params.dueAt ? new Date(params.dueAt) : null,
  });
  return { success: true };
}

async function executeCompleteTask(params: Record<string, any>, context: ActionExecutionContext) {
  const taskId = context.payload.task?.id;
  if (!taskId) return { success: false, error: 'Missing taskId in payload' };

  const { tasks } = await import('@/lib/db/schema/activities');
  const [updated] = await db.update(tasks)
    .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .returning();
    
  if (updated) {
    publishEvent({
      accountId: context.accountId,
      triggerType: 'task.completed',
      entityType: 'task',
      entityId: updated.id,
      payload: { task: updated },
      depth: context.depth + 1,
    });
  }
    
  return { success: true };
}

async function executeCreateNote(params: Record<string, any>, context: ActionExecutionContext) {
  const { notes } = await import('@/lib/db/schema/activities');
  const contactId = context.payload.contact?.id || context.payload.deal?.contactId || null;
  const dealId = context.payload.deal?.id || null;
  
  await db.insert(notes).values({
    accountId: context.accountId,
    createdByUserId: params.authorUserId || null,
    content: params.content || 'Automated Note',
    contactId,
    dealId,
  });
  return { success: true };
}

async function executeSendMessage(params: Record<string, any>, context: ActionExecutionContext) {
  const conversationId = context.payload.conversationId || context.payload.conversation?.id;
  const text = params.text;
  
  if (!conversationId || !text) return { success: false, error: 'Missing conversationId or text' };

  // Use Zenith internal sendMessageToConversation directly
  const { sendMessageToConversation } = await import('@/lib/whatsapp/send-message');
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  try {
    await sendMessageToConversation(supabase, context.accountId, {
      conversationId,
      messageType: 'text',
      contentText: text,
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

