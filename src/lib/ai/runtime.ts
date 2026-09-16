import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  accounts,
  activities,
  automations,
  aiAgents,
  aiConversationControls,
  aiJobs,
  aiDocuments,
  aiDocumentVersions,
  aiKnowledgeChunks,
  aiRunSources,
  contacts,
  conversations,
  messages,
  tasks,
} from "@/lib/db/schema";
import { cancelActiveEnrollments } from "@/lib/followups/engine";
import { getDefaultServiceChannel } from "@/lib/messaging/channel-store";
import { getMessagingProvider } from "@/lib/messaging";
import { reserveAiBudget, reconcileAiBudget, expireAiReservations } from "./budget";
import { estimateTokens } from "./chunk";
import { aiRequestTimeoutMs, loadCurrentAgent } from "./config";
import {
  calculateCostMicros,
  calculateEmbeddingCostMicros,
  calculateGenerationReservation,
} from "./cost";
import { processDocumentIngestion } from "./ingestion";
import {
  claimNextAiJob,
  completeAiJob,
  failAiJob,
} from "./jobs";
import {
  buildAgentPrompt,
  deterministicHandoffReason,
  latestCustomerMessage,
  parseAgentDecision,
} from "./prompt";
import { embedTexts, fetchGenerationAdapter } from "./provider";
import { loadActiveMemories, retrieveAuthorizedKnowledge } from "./retrieval";
import type { AiGenerationAdapter, AiChatMessage } from "./types";

type ReplyPayload = {
  conversationId: string;
  contactId: string;
  sourceMessageId: string;
};

function replyPayload(value: Record<string, unknown>): ReplyPayload | null {
  return typeof value.conversationId === "string" &&
    typeof value.contactId === "string" &&
    typeof value.sourceMessageId === "string"
    ? value as Record<string, unknown> & ReplyPayload
    : null;
}

async function handoff(args: {
  accountId: string;
  conversationId: string;
  contactId: string;
  reason: string;
}) {
  await db.transaction(async (tx) => {
    await tx.insert(aiConversationControls).values({
      accountId: args.accountId,
      conversationId: args.conversationId,
      mode: "handoff",
      generation: 1,
      reasonCode: args.reason,
    }).onConflictDoUpdate({
      target: aiConversationControls.conversationId,
      set: {
        mode: "handoff",
        generation: sql`${aiConversationControls.generation} + 1`,
        reasonCode: args.reason,
        updatedAt: new Date(),
      },
    });
    await tx.update(conversations).set({
      aiAutoreplyDisabled: true,
      aiHandoffSummary: `IA transferiu para atendimento humano (${args.reason}).`,
      updatedAt: new Date(),
    }).where(and(
      eq(conversations.id, args.conversationId),
      eq(conversations.accountId, args.accountId),
    ));
  });
  await cancelActiveEnrollments(args.accountId, "manual", args.contactId);
}

async function loadReplyContext(accountId: string, payload: ReplyPayload) {
  const [row] = await db.select({
    conversation: conversations,
    contact: contacts,
    accountStatus: accounts.status,
    controlMode: aiConversationControls.mode,
    controlGeneration: aiConversationControls.generation,
    sourceContent: messages.contentText,
    sourceSender: messages.senderType,
  }).from(conversations)
    .innerJoin(contacts, and(
      eq(contacts.id, conversations.contactId),
      eq(contacts.accountId, conversations.accountId),
    ))
    .innerJoin(accounts, eq(accounts.id, conversations.accountId))
    .innerJoin(messages, and(
      eq(messages.id, payload.sourceMessageId),
      eq(messages.conversationId, conversations.id),
    ))
    .leftJoin(aiConversationControls, and(
      eq(aiConversationControls.conversationId, conversations.id),
      eq(aiConversationControls.accountId, conversations.accountId),
    ))
    .where(and(
      eq(conversations.id, payload.conversationId),
      eq(conversations.accountId, accountId),
      eq(contacts.id, payload.contactId),
    )).limit(1);
  return row ?? null;
}

async function conversationMessages(accountId: string, conversationId: string) {
  const rows = await db.select({
    sender: messages.senderType,
    content: messages.contentText,
  }).from(messages).innerJoin(conversations, and(
    eq(conversations.id, messages.conversationId),
    eq(conversations.accountId, accountId),
  )).where(and(
    eq(messages.conversationId, conversationId),
    eq(messages.contentType, "text"),
  )).orderBy(desc(messages.createdAt)).limit(20);
  return rows.reverse().filter((row) => row.content?.trim()).map((row) => ({
    role: row.sender === "customer" ? "user" : "assistant",
    content: row.content!.trim(),
  })) satisfies AiChatMessage[];
}

export async function isAiSendEligible(args: {
  accountId: string;
  conversationId: string;
  contactId: string;
  agentId: string;
  controlGeneration: number;
}) {
  const [row] = await db.select({
    accountStatus: accounts.status,
    agentStatus: aiAgents.status,
    assignedAgentId: conversations.assignedAgentId,
    aiDisabled: conversations.aiAutoreplyDisabled,
    blocked: contacts.isBlocked,
    optOut: contacts.optOut,
    anonymizedAt: contacts.anonymizedAt,
    mode: aiConversationControls.mode,
    generation: aiConversationControls.generation,
  }).from(conversations)
    .innerJoin(accounts, eq(accounts.id, conversations.accountId))
    .innerJoin(contacts, and(
      eq(contacts.id, conversations.contactId),
      eq(contacts.accountId, conversations.accountId),
    ))
    .innerJoin(aiAgents, and(
      eq(aiAgents.id, args.agentId),
      eq(aiAgents.accountId, conversations.accountId),
    ))
    .leftJoin(aiConversationControls, and(
      eq(aiConversationControls.conversationId, conversations.id),
      eq(aiConversationControls.accountId, conversations.accountId),
    ))
    .where(and(
      eq(conversations.id, args.conversationId),
      eq(conversations.accountId, args.accountId),
      eq(contacts.id, args.contactId),
    )).limit(1);
  const generation = row?.generation ?? 0;
  return Boolean(row &&
    row.accountStatus === "active" &&
    row.agentStatus === "active" &&
    !row.assignedAgentId &&
    !row.aiDisabled &&
    !row.blocked &&
    !row.optOut &&
    !row.anonymizedAt &&
    (row.mode ?? "active") === "active" &&
    generation === args.controlGeneration);
}

async function sendAiMessage(args: {
  accountId: string;
  conversationId: string;
  contactId: string;
  runId: string;
  text: string;
  agentId: string;
  controlGeneration: number;
}) {
  const existing = await db.select().from(messages).where(eq(messages.aiRunId, args.runId)).limit(1);
  if (existing[0]) return existing[0].status === "sent" ? "already_sent" : "send_state_uncertain";

  const [contact] = await db.select().from(contacts).where(and(
    eq(contacts.id, args.contactId),
    eq(contacts.accountId, args.accountId),
  )).limit(1);
  const channel = await getDefaultServiceChannel(args.accountId);
  if (!contact || !channel) throw new Error("messaging_channel_unavailable");
  const [created] = await db.insert(messages).values({
    conversationId: args.conversationId,
    senderType: "bot",
    contentType: "text",
    contentText: args.text,
    status: "sending",
    provider: channel.provider,
    messagingChannelId: channel.id,
    aiGenerated: true,
    aiRunId: args.runId,
  }).onConflictDoNothing({ target: messages.aiRunId }).returning();
  if (!created) return "already_claimed";

  try {
    if (!await isAiSendEligible(args)) {
      await db.update(messages).set({
        status: "failed",
        transportError: "control_changed_before_send",
      }).where(eq(messages.id, created.id));
      return "cancelled_before_send";
    }
    const sent = await getMessagingProvider(channel.provider).send({
      to: contact.phoneNormalized || contact.phone,
      contentType: "text",
      purpose: "service",
      mode: "single",
      text: args.text,
    }, channel.config);
    await db.transaction(async (tx) => {
      await tx.update(messages).set({
        status: "sent",
        messageId: sent.providerMessageId,
        transportError: null,
      }).where(eq(messages.id, created.id));
      await tx.update(conversations).set({
        lastMessageText: args.text,
        lastMessageAt: new Date(),
        firstUnrepliedMessageAt: null,
        slaStatus: "ok",
        aiReplyCount: sql`${conversations.aiReplyCount} + 1`,
        updatedAt: new Date(),
      }).where(and(
        eq(conversations.id, args.conversationId),
        eq(conversations.accountId, args.accountId),
      ));
    });
    return "sent";
  } catch (error) {
    await db.update(messages).set({
      status: "failed",
      transportError: error instanceof Error ? error.name : "UnknownError",
    }).where(eq(messages.id, created.id));
    throw error;
  }
}

async function sourcesStillAuthorized(
  accountId: string,
  sources: Array<{ chunkId: string; documentId: string; documentVersionId: string }>,
) {
  if (sources.length === 0) return false;
  const rows = await db.select({ id: aiKnowledgeChunks.id }).from(aiKnowledgeChunks)
    .innerJoin(aiDocuments, and(
      eq(aiDocuments.id, aiKnowledgeChunks.documentId),
      eq(aiDocuments.accountId, aiKnowledgeChunks.accountId),
    ))
    .innerJoin(aiDocumentVersions, and(
      eq(aiDocumentVersions.id, aiKnowledgeChunks.documentVersionId),
      eq(aiDocumentVersions.accountId, aiKnowledgeChunks.accountId),
    ))
    .where(and(
      eq(aiKnowledgeChunks.accountId, accountId),
      inArray(aiKnowledgeChunks.id, sources.map((source) => source.chunkId)),
      eq(aiDocuments.status, "ready"),
      eq(aiDocumentVersions.status, "ready"),
      eq(aiDocumentVersions.version, aiDocuments.currentVersion),
    ));
  return rows.length === new Set(sources.map((source) => source.chunkId)).size;
}

async function embedRetrievalQuery(args: {
  accountId: string;
  sourceMessageId: string;
  conversationId: string;
  controlGeneration: number;
  query: string;
  config: NonNullable<Awaited<ReturnType<typeof loadCurrentAgent>>>;
}) {
  if (!args.config.embeddingsApiKey) return null;
  const estimatedTokens = estimateTokens(args.query);
  const reservedMicros = Math.max(1, calculateEmbeddingCostMicros(
    estimatedTokens,
    args.config.version.embeddingPriceMicrosPerMillion,
  ));
  if (reservedMicros > args.config.version.perCallLimitMicros) return null;
  const reservation = await reserveAiBudget({
    accountId: args.accountId,
    agentId: args.config.agent.id,
    agentVersionId: args.config.version.id,
    conversationId: args.conversationId,
    sourceMessageId: args.sourceMessageId,
    kind: "retrieval_embedding",
    idempotencyKey: `retrieval-embedding:${args.sourceMessageId}`,
    controlGeneration: args.controlGeneration,
    provider: args.config.version.embeddingsProvider,
    model: args.config.version.embeddingsModel,
    reservedMicros,
    monthlyLimitMicros: args.config.version.monthlyLimitMicros,
    maxConcurrency: args.config.version.maxConcurrency,
  });
  if (!reservation.ok || reservation.replay) return null;
  const started = Date.now();
  try {
    const result = await embedTexts({
      apiKey: args.config.embeddingsApiKey,
      model: args.config.version.embeddingsModel,
      inputs: [args.query],
      timeoutMs: aiRequestTimeoutMs(),
    });
    const actualCost = result.usageTokens > 0
      ? calculateEmbeddingCostMicros(
          result.usageTokens,
          args.config.version.embeddingPriceMicrosPerMillion,
        )
      : null;
    await reconcileAiBudget({
      accountId: args.accountId,
      runId: reservation.run.id,
      status: "completed",
      actualCostMicros: actualCost,
      inputTokens: result.usageTokens || null,
      outputTokens: 0,
      durationMs: Date.now() - started,
      resultCode: "retrieval_embedded",
    });
    return result.embeddings[0] ?? null;
  } catch (error) {
    await reconcileAiBudget({
      accountId: args.accountId,
      runId: reservation.run.id,
      status: "failed",
      actualCostMicros: null,
      inputTokens: null,
      outputTokens: null,
      durationMs: Date.now() - started,
      errorCode: error instanceof Error && "code" in error
        ? String((error as { code: unknown }).code)
        : "retrieval_embedding_failed",
    });
    return null;
  }
}

async function processReplyJob(
  job: typeof aiJobs.$inferSelect,
  adapter: AiGenerationAdapter,
) {
  const payload = replyPayload(job.payload);
  if (!payload) throw new Error("invalid_reply_payload");
  const [context, config] = await Promise.all([
    loadReplyContext(job.accountId, payload),
    loadCurrentAgent(job.accountId, true),
  ]);
  if (!context || !config) return "not_eligible";
  if (
    context.accountStatus !== "active" ||
    context.sourceSender !== "customer" ||
    !context.sourceContent ||
    context.contact.isBlocked ||
    context.contact.optOut ||
    context.contact.anonymizedAt ||
    context.conversation.assignedAgentId ||
    context.conversation.aiAutoreplyDisabled ||
    (context.controlMode ?? "active") !== "active"
  ) return "not_eligible";
  if (!config.generationApiKey) {
    await handoff({ ...payload, accountId: job.accountId, reason: "credentials_missing" });
    return "handoff";
  }

  const chat = await conversationMessages(job.accountId, payload.conversationId);
  const latest = latestCustomerMessage(chat);
  const deterministicReason = deterministicHandoffReason(latest);
  if (deterministicReason) {
    await handoff({ ...payload, accountId: job.accountId, reason: deterministicReason });
    return "handoff";
  }
  const [activeResponder] = await db.select({ id: automations.id }).from(automations).where(and(
    eq(automations.accountId, job.accountId),
    eq(automations.status, "active"),
    inArray(automations.triggerType, ["message.received", "new_message_received", "keyword_match"]),
  )).limit(1);
  if (activeResponder) return "automation_owns_reply";
  const controlGeneration = context.controlGeneration ?? 0;
  const queryEmbedding = await embedRetrievalQuery({
    accountId: job.accountId,
    sourceMessageId: payload.sourceMessageId,
    conversationId: payload.conversationId,
    controlGeneration,
    query: latest,
    config,
  });
  const [sources, memories] = await Promise.all([
    retrieveAuthorizedKnowledge({ accountId: job.accountId, query: latest, embedding: queryEmbedding }),
    loadActiveMemories({
      accountId: job.accountId,
      contactId: payload.contactId,
      conversationId: payload.conversationId,
    }),
  ]);
  if (sources.length === 0) {
    await handoff({ ...payload, accountId: job.accountId, reason: "insufficient_evidence" });
    return "handoff";
  }

  const systemPrompt = buildAgentPrompt({
    instructions: config.version.instructions,
    handoffCriteria: config.version.handoffCriteria,
    sources,
    memories: memories.map((memory) => memory.content),
    allowedTools: config.version.allowedTools,
  });
  const estimatedInputTokens = estimateTokens(systemPrompt) +
    chat.reduce((sum, message) => sum + estimateTokens(message.content), 0);
  if (estimatedInputTokens > config.version.maxInputTokens) {
    await handoff({ ...payload, accountId: job.accountId, reason: "input_token_limit" });
    return "handoff";
  }
  const estimate = calculateGenerationReservation({
    estimatedInputTokens,
    maxInputTokens: config.version.maxInputTokens,
    maxOutputTokens: config.version.maxOutputTokens,
    inputPriceMicrosPerMillion: config.version.inputPriceMicrosPerMillion,
    outputPriceMicrosPerMillion: config.version.outputPriceMicrosPerMillion,
    perCallLimitMicros: config.version.perCallLimitMicros,
  });
  if (!estimate.ok) {
    await handoff({ ...payload, accountId: job.accountId, reason: estimate.code });
    return "handoff";
  }
  const reservation = await reserveAiBudget({
    accountId: job.accountId,
    agentId: config.agent.id,
    agentVersionId: config.version.id,
    conversationId: payload.conversationId,
    sourceMessageId: payload.sourceMessageId,
    kind: "generation",
    idempotencyKey: `generation:${payload.sourceMessageId}`,
    controlGeneration,
    provider: config.version.generationProvider,
    model: config.version.generationModel,
    reservedMicros: estimate.reservedMicros,
    monthlyLimitMicros: config.version.monthlyLimitMicros,
    maxConcurrency: config.version.maxConcurrency,
  });
  if (!reservation.ok) {
    await handoff({ ...payload, accountId: job.accountId, reason: reservation.code });
    return "handoff";
  }
  if (reservation.replay) {
    const [existingMessage] = await db.select({ status: messages.status }).from(messages).where(
      eq(messages.aiRunId, reservation.run.id),
    ).limit(1);
    if (reservation.run.status === "completed" || existingMessage?.status === "sent") {
      if (reservation.run.status !== "completed") {
        await reconcileAiBudget({
          accountId: job.accountId,
          runId: reservation.run.id,
          status: "completed",
          actualCostMicros: null,
          inputTokens: null,
          outputTokens: null,
          durationMs: 0,
          resultCode: "recovered_sent_replay",
        });
      }
      return "replayed";
    }
    if (["reserved", "running"].includes(reservation.run.status)) {
      await reconcileAiBudget({
        accountId: job.accountId,
        runId: reservation.run.id,
        status: "failed",
        actualCostMicros: null,
        inputTokens: null,
        outputTokens: null,
        durationMs: 0,
        errorCode: "replay_delivery_state_unknown",
      });
    }
    await handoff({
      ...payload,
      accountId: job.accountId,
      reason: reservation.run.status === "handoff"
        ? reservation.run.resultCode ?? "handoff_replay"
        : "replay_delivery_state_unknown",
    });
    return "handoff";
  }

  const started = Date.now();
  try {
    const generated = await adapter.generate({
      provider: config.version.generationProvider as "openai" | "anthropic",
      model: config.version.generationModel,
      apiKey: config.generationApiKey,
      systemPrompt,
      messages: chat,
      maxOutputTokens: config.version.maxOutputTokens,
      timeoutMs: aiRequestTimeoutMs(),
    });
    const decision = parseAgentDecision(generated.text, sources.length);
    const actualCost = generated.usage
      ? calculateCostMicros(
          generated.usage.inputTokens,
          generated.usage.outputTokens,
          config.version.inputPriceMicrosPerMillion,
          config.version.outputPriceMicrosPerMillion,
        )
      : null;

    if (decision.action === "handoff") {
      await reconcileAiBudget({
        accountId: job.accountId,
        runId: reservation.run.id,
        status: "handoff",
        actualCostMicros: actualCost,
        inputTokens: generated.usage?.inputTokens ?? null,
        outputTokens: generated.usage?.outputTokens ?? null,
        durationMs: Date.now() - started,
        resultCode: decision.reason,
      });
      await handoff({ ...payload, accountId: job.accountId, reason: decision.reason });
      return "handoff";
    }

    const eligible = await isAiSendEligible({
      accountId: job.accountId,
      conversationId: payload.conversationId,
      contactId: payload.contactId,
      agentId: config.agent.id,
      controlGeneration,
    });
    if (!eligible) {
      await reconcileAiBudget({
        accountId: job.accountId,
        runId: reservation.run.id,
        status: "cancelled",
        actualCostMicros: actualCost,
        inputTokens: generated.usage?.inputTokens ?? null,
        outputTokens: generated.usage?.outputTokens ?? null,
        durationMs: Date.now() - started,
        resultCode: "control_changed_before_send",
      });
      return "cancelled";
    }

    const cited = decision.citations.map((citation) => sources[Number(citation.slice(1)) - 1]).filter(Boolean);
    if (!await sourcesStillAuthorized(job.accountId, cited)) {
      await reconcileAiBudget({
        accountId: job.accountId,
        runId: reservation.run.id,
        status: "cancelled",
        actualCostMicros: actualCost,
        inputTokens: generated.usage?.inputTokens ?? null,
        outputTokens: generated.usage?.outputTokens ?? null,
        durationMs: Date.now() - started,
        resultCode: "source_removed_before_send",
      });
      await handoff({ ...payload, accountId: job.accountId, reason: "source_removed_before_send" });
      return "handoff";
    }
    await db.insert(aiRunSources).values(cited.map((source, rank) => ({
      accountId: job.accountId,
      runId: reservation.run.id,
      documentId: source.documentId,
      documentVersionId: source.documentVersionId,
      chunkId: source.chunkId,
      rank,
      scoreMicros: source.score === null ? null : Math.round(source.score * 1_000_000),
    }))).onConflictDoNothing();

    if (decision.action === "create_task" && config.version.allowedTools.includes("create_task")) {
      await db.transaction(async (tx) => {
        const [task] = await tx.insert(tasks).values({
          accountId: job.accountId,
          title: decision.task.title,
          description: decision.task.description ?? null,
          contactId: payload.contactId,
          createdByUserId: config.agent.createdByUserId,
        }).returning();
        await tx.insert(activities).values({
          accountId: job.accountId,
          type: "ai_task_created",
          actorUserId: config.agent.createdByUserId,
          contactId: payload.contactId,
          taskId: task.id,
          metadata: { aiRunId: reservation.run.id },
        });
      });
    }

    await cancelActiveEnrollments(job.accountId, "manual", payload.contactId);
    const sendResult = await sendAiMessage({
      accountId: job.accountId,
      conversationId: payload.conversationId,
      contactId: payload.contactId,
      runId: reservation.run.id,
      text: decision.answer,
      agentId: config.agent.id,
      controlGeneration,
    });
    if (!["sent", "already_sent"].includes(sendResult)) {
      await reconcileAiBudget({
        accountId: job.accountId,
        runId: reservation.run.id,
        status: "cancelled",
        actualCostMicros: actualCost,
        inputTokens: generated.usage?.inputTokens ?? null,
        outputTokens: generated.usage?.outputTokens ?? null,
        durationMs: Date.now() - started,
        resultCode: sendResult,
      });
      return "cancelled";
    }
    await reconcileAiBudget({
      accountId: job.accountId,
      runId: reservation.run.id,
      status: "completed",
      actualCostMicros: actualCost,
      inputTokens: generated.usage?.inputTokens ?? null,
      outputTokens: generated.usage?.outputTokens ?? null,
      durationMs: Date.now() - started,
      resultCode: decision.action,
    });
    return "completed";
  } catch (error) {
    const code = error instanceof Error && "code" in error
      ? String((error as { code: unknown }).code)
      : error instanceof Error ? error.name : "generation_failed";
    await reconcileAiBudget({
      accountId: job.accountId,
      runId: reservation.run.id,
      status: "failed",
      actualCostMicros: null,
      inputTokens: null,
      outputTokens: null,
      durationMs: Date.now() - started,
      errorCode: code,
    });
    await handoff({ ...payload, accountId: job.accountId, reason: code });
    return "handoff";
  }
}

export async function processNextAiJob(
  adapter: AiGenerationAdapter = fetchGenerationAdapter,
) {
  await expireAiReservations();
  const job = await claimNextAiJob();
  if (!job) return false;
  try {
    if (job.type === "ingest_document") {
      await processDocumentIngestion(job.accountId, job.payload);
    } else if (job.type === "generate_reply") {
      await processReplyJob(job, adapter);
    } else {
      throw new Error("unsupported_ai_job");
    }
    await completeAiJob(job.accountId, job.id);
  } catch (error) {
    const code = error instanceof Error && "code" in error
      ? String((error as { code: unknown }).code)
      : error instanceof Error ? error.name : "unknown_error";
    await failAiJob(job, code);
    if (job.type === "ingest_document") {
      const documentId = typeof job.payload.documentId === "string" ? job.payload.documentId : null;
      const versionId = typeof job.payload.documentVersionId === "string" ? job.payload.documentVersionId : null;
      if (documentId && versionId) {
        const status = job.attempts >= job.maxAttempts ? "failed" : "queued";
        await db.transaction(async (tx) => {
          await tx.update(aiDocuments).set({ status, errorCode: code, updatedAt: new Date() }).where(and(
            eq(aiDocuments.id, documentId),
            eq(aiDocuments.accountId, job.accountId),
          ));
          await tx.update(aiDocumentVersions).set({ status, errorCode: code }).where(and(
            eq(aiDocumentVersions.id, versionId),
            eq(aiDocumentVersions.accountId, job.accountId),
          ));
        });
      }
    }
  }
  return true;
}
