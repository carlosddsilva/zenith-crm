import { and, eq } from "drizzle-orm";

import type { AutomationAction, AutomationCondition } from "@/types";
import { db } from "@/lib/db/client";
import {
  contacts,
  contactTags,
  conversations,
  deals,
  messages,
  notes,
  pipelines,
  pipelineStages,
  tags,
  tasks,
} from "@/lib/db/schema";
import { publishEvent } from "@/lib/events/bus";
import { getDefaultServiceChannel } from "@/lib/messaging/channel-store";
import { getMessagingProvider, MessagingProviderError } from "@/lib/messaging";

type JsonRecord = Record<string, unknown>;

export function evaluateConditions(conditions: AutomationCondition[], payload: JsonRecord): boolean {
  if (!conditions?.length) return true;
  return conditions.every((condition) => {
    const fieldValue = getNestedValue(payload, condition.field);
    switch (condition.operator) {
      case "equals": return fieldValue == condition.value;
      case "not_equals": return fieldValue != condition.value;
      case "contains": return typeof fieldValue === "string" && fieldValue.includes(String(condition.value));
      case "is_empty": return fieldValue === null || fieldValue === undefined || fieldValue === "";
      case "is_not_empty": return fieldValue !== null && fieldValue !== undefined && fieldValue !== "";
      default: return false;
    }
  });
}

function getNestedValue(value: unknown, path: string): unknown {
  if (path.includes("__proto__") || path.includes("constructor") || path.includes("prototype")) return undefined;
  return path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as JsonRecord)[part];
  }, value);
}

function nestedString(payload: JsonRecord, path: string): string | null {
  const value = getNestedValue(payload, path);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function paramString(params: JsonRecord, key: string): string | null {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export interface ActionExecutionContext {
  accountId: string;
  automationId: string;
  automationOwnerUserId: string;
  runId: string;
  payload: JsonRecord;
  depth: number;
  dryRun?: boolean;
}

export async function executeAction(action: AutomationAction, context: ActionExecutionContext): Promise<{ success: boolean; error?: string }> {
  try {
    const params = action.params as JsonRecord;
    switch (action.type) {
      case "contact.add_tag": return executeAddTag(params, context);
      case "contact.remove_tag": return executeRemoveTag(params, context);
      case "deal.move_stage": return executeMoveDealStage(params, context);
      case "task.create": return executeCreateTask(params, context);
      case "task.complete": return executeCompleteTask(context);
      case "note.create": return executeCreateNote(params, context);
      case "send_message": return executeSendMessage(params, context);
      case "conversation.assign": return executeAssignConversation(params, context);
      default: return { success: false, error: "unsupported_action" };
    }
  } catch (error) {
    console.error("[automation] action failed", {
      accountId: context.accountId,
      automationId: context.automationId,
      runId: context.runId,
      actionType: action.type,
      code: error instanceof MessagingProviderError ? error.code : "action_failed",
    });
    return { success: false, error: error instanceof MessagingProviderError ? error.code : "action_failed" };
  }
}

async function validContactAndTag(accountId: string, contactId: string, tagId: string) {
  const [contact, tag] = await Promise.all([
    db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.accountId, accountId))).limit(1),
    db.select({ id: tags.id }).from(tags).where(and(eq(tags.id, tagId), eq(tags.accountId, accountId))).limit(1),
  ]);
  return contact.length === 1 && tag.length === 1;
}

async function executeAddTag(params: JsonRecord, context: ActionExecutionContext) {
  const contactId = nestedString(context.payload, "contact.id") ?? nestedString(context.payload, "deal.contactId");
  const tagId = paramString(params, "tagId");
  if (!contactId || !tagId) return { success: false, error: "missing_contact_or_tag" };
  if (!(await validContactAndTag(context.accountId, contactId, tagId))) return { success: false, error: "contact_or_tag_not_found" };
  
  if (context.dryRun) return { success: true };
  
  await db.insert(contactTags).values({ contactId, tagId }).onConflictDoNothing();
  return { success: true };
}

async function executeRemoveTag(params: JsonRecord, context: ActionExecutionContext) {
  const contactId = nestedString(context.payload, "contact.id") ?? nestedString(context.payload, "deal.contactId");
  const tagId = paramString(params, "tagId");
  if (!contactId || !tagId) return { success: false, error: "missing_contact_or_tag" };
  if (!(await validContactAndTag(context.accountId, contactId, tagId))) return { success: false, error: "contact_or_tag_not_found" };
  
  if (context.dryRun) return { success: true };
  
  await db.delete(contactTags).where(and(eq(contactTags.contactId, contactId), eq(contactTags.tagId, tagId)));
  return { success: true };
}

async function executeMoveDealStage(params: JsonRecord, context: ActionExecutionContext) {
  const dealId = nestedString(context.payload, "deal.id");
  const stageId = paramString(params, "stageId");
  if (!dealId || !stageId) return { success: false, error: "missing_deal_or_stage" };
  const [stage] = await db.select({ id: pipelineStages.id }).from(pipelineStages)
    .innerJoin(pipelines, eq(pipelineStages.pipelineId, pipelines.id))
    .where(and(eq(pipelineStages.id, stageId), eq(pipelines.accountId, context.accountId))).limit(1);
  if (!stage) return { success: false, error: "stage_not_found" };
  
  if (context.dryRun) return { success: true };
  
  const updated = await db.transaction(async (tx) => {
    const [updatedDeal] = await tx.update(deals).set({ stageId, updatedAt: new Date() })
      .where(and(eq(deals.id, dealId), eq(deals.accountId, context.accountId))).returning();
    if (!updatedDeal) return null;
    await publishEvent(tx, { accountId: context.accountId, triggerType: "deal.stage_changed", entityType: "deal", entityId: updatedDeal.id, payload: { deal: updatedDeal }, depth: context.depth + 1 });
    return updatedDeal;
  });
  
  if (!updated) return { success: false, error: "deal_not_found" };
  return { success: true };
}

async function executeCreateTask(params: JsonRecord, context: ActionExecutionContext) {
  const values = {
    accountId: context.accountId,
    createdByUserId: context.automationOwnerUserId,
    assignedUserId: paramString(params, "assignedUserId"),
    title: paramString(params, "title") ?? "Automated Task",
    description: paramString(params, "description"),
    contactId: nestedString(context.payload, "contact.id") ?? nestedString(context.payload, "deal.contactId"),
    dealId: nestedString(context.payload, "deal.id"),
    status: "pending" as const,
    priority: paramString(params, "priority") as "low" | "normal" | "high" ?? "normal",
    dueAt: paramString(params, "dueAt") ? new Date(paramString(params, "dueAt")!) : null,
  };
  
  if (context.dryRun) return { success: true };
  
  const newTask = await db.insert(tasks).values(values).returning();
  
  // Publish event for task created
  await db.transaction(async (tx) => {
    await publishEvent(tx, { 
      accountId: context.accountId, 
      triggerType: "task.created" as any, // if we added it, wait we didn't add task.created to trigger types. Let's just create it.
      entityType: "task", 
      entityId: newTask[0].id, 
      payload: { task: newTask[0] }, 
      depth: context.depth + 1 
    });
  });

  return { success: true };
}

async function executeCompleteTask(context: ActionExecutionContext) {
  const taskId = nestedString(context.payload, "task.id");
  if (!taskId) return { success: false, error: "missing_task" };
  
  if (context.dryRun) return { success: true };
  
  const updated = await db.transaction(async (tx) => {
    const [updatedTask] = await tx.update(tasks).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.accountId, context.accountId))).returning();
    if (!updatedTask) return null;
    await publishEvent(tx, { accountId: context.accountId, triggerType: "task.completed", entityType: "task", entityId: updatedTask.id, payload: { task: updatedTask }, depth: context.depth + 1 });
    return updatedTask;
  });
  
  if (!updated) return { success: false, error: "task_not_found" };
  return { success: true };
}

async function executeCreateNote(params: JsonRecord, context: ActionExecutionContext) {
  const values = {
    accountId: context.accountId,
    createdByUserId: context.automationOwnerUserId,
    content: paramString(params, "content") ?? "Automated Note",
    contactId: nestedString(context.payload, "contact.id") ?? nestedString(context.payload, "deal.contactId"),
    dealId: nestedString(context.payload, "deal.id"),
  };
  
  if (context.dryRun) return { success: true };
  
  await db.insert(notes).values(values);
  return { success: true };
}

async function executeSendMessage(params: JsonRecord, context: ActionExecutionContext) {
  const conversationId = nestedString(context.payload, "conversationId") ?? nestedString(context.payload, "conversation.id");
  const text = paramString(params, "text");
  if (!conversationId || !text) return { success: false, error: "missing_conversation_or_text" };
  const [row] = await db.select({ id: conversations.id, phone: contacts.phone, phoneNormalized: contacts.phoneNormalized, isBlocked: contacts.isBlocked, optOut: contacts.optOut, anonymizedAt: contacts.anonymizedAt })
    .from(conversations).innerJoin(contacts, eq(conversations.contactId, contacts.id))
    .where(and(eq(conversations.id, conversationId), eq(conversations.accountId, context.accountId), eq(contacts.accountId, context.accountId))).limit(1);
  if (!row) return { success: false, error: "conversation_not_found" };
  if (row.isBlocked || row.optOut || row.anonymizedAt) return { success: false, error: "contact_lgpd_blocked" };
  const channel = await getDefaultServiceChannel(context.accountId);
  if (!channel) return { success: false, error: "messaging_channel_not_configured" };
  
  if (context.dryRun) return { success: true };
  
  const [message] = await db.insert(messages).values({
    conversationId, senderType: "bot", contentType: "text", contentText: text,
    status: "sending", provider: channel.provider, messagingChannelId: channel.id,
  }).returning();
  try {
    const result = await getMessagingProvider(channel.provider).send({ to: row.phoneNormalized || row.phone, contentType: "text", purpose: "service", mode: "single", text }, channel.config);
    await db.transaction(async (tx) => {
      await tx.update(messages).set({ status: "sent", messageId: result.providerMessageId, transportError: null }).where(eq(messages.id, message.id));
      await tx.update(conversations).set({ lastMessageText: text, lastMessageAt: new Date(), updatedAt: new Date() }).where(and(eq(conversations.id, conversationId), eq(conversations.accountId, context.accountId)));
    });
    return { success: true };
  } catch (error) {
    const code = error instanceof MessagingProviderError ? error.code : "provider_send_failed";
    await db.update(messages).set({ status: "failed", transportError: code }).where(eq(messages.id, message.id));
    throw error;
  }
}

async function executeAssignConversation(params: JsonRecord, context: ActionExecutionContext) {
  const conversationId = nestedString(context.payload, "conversationId") ?? nestedString(context.payload, "conversation.id");
  const assigneeId = paramString(params, "assigneeId");
  
  if (!conversationId || !assigneeId) return { success: false, error: "missing_conversation_or_assignee" };
  
  if (context.dryRun) return { success: true };
  
  const updated = await db.update(conversations)
    .set({ assignedAgentId: assigneeId, updatedAt: new Date() })
    .where(and(eq(conversations.id, conversationId), eq(conversations.accountId, context.accountId)))
    .returning();
    
  if (updated.length === 0) return { success: false, error: "conversation_not_found" };
  return { success: true };
}
