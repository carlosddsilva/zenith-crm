import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

import { contacts } from "./contacts";
import { accounts, users } from "./identity";
import { conversations, messages } from "./inbox";

export const aiAgentStatusEnum = pgEnum("ai_agent_status", [
  "inactive",
  "active",
]);

export const aiDocumentStatusEnum = pgEnum("ai_document_status", [
  "queued",
  "indexing",
  "ready",
  "failed",
  "removed",
]);

export const aiJobStatusEnum = pgEnum("ai_job_status", [
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

export const aiRunStatusEnum = pgEnum("ai_run_status", [
  "reserved",
  "running",
  "completed",
  "failed",
  "cancelled",
  "handoff",
]);

export const aiConversationModeEnum = pgEnum("ai_conversation_mode", [
  "active",
  "paused",
  "handoff",
]);

export const aiAgents = pgTable(
  "ai_agents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Agente Zenith"),
    status: aiAgentStatusEnum("status").notNull().default("inactive"),
    currentVersion: integer("current_version").notNull().default(0),
    generationApiKeyEncrypted: text("generation_api_key_encrypted"),
    embeddingsApiKeyEncrypted: text("embeddings_api_key_encrypted"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("ai_agents_account_uidx").on(table.accountId)],
);

export const aiAgentVersions = pgTable(
  "ai_agent_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => aiAgents.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    instructions: text("instructions").notNull(),
    authorizedChannels: jsonb("authorized_channels")
      .$type<string[]>()
      .notNull()
      .default([]),
    allowedTools: jsonb("allowed_tools")
      .$type<string[]>()
      .notNull()
      .default([]),
    generationProvider: text("generation_provider").notNull(),
    generationModel: text("generation_model").notNull(),
    embeddingsProvider: text("embeddings_provider").notNull(),
    embeddingsModel: text("embeddings_model").notNull(),
    inputPriceMicrosPerMillion: bigint("input_price_micros_per_million", {
      mode: "number",
    }).notNull(),
    outputPriceMicrosPerMillion: bigint("output_price_micros_per_million", {
      mode: "number",
    }).notNull(),
    embeddingPriceMicrosPerMillion: bigint(
      "embedding_price_micros_per_million",
      { mode: "number" },
    ).notNull(),
    perCallLimitMicros: bigint("per_call_limit_micros", { mode: "number" })
      .notNull(),
    monthlyLimitMicros: bigint("monthly_limit_micros", { mode: "number" })
      .notNull(),
    maxInputTokens: integer("max_input_tokens").notNull(),
    maxOutputTokens: integer("max_output_tokens").notNull(),
    maxConcurrency: integer("max_concurrency").notNull(),
    memoryRetentionDays: integer("memory_retention_days").notNull(),
    handoffCriteria: jsonb("handoff_criteria")
      .$type<string[]>()
      .notNull()
      .default([]),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ai_agent_versions_agent_version_uidx").on(
      table.agentId,
      table.version,
    ),
    index("ai_agent_versions_account_idx").on(table.accountId),
  ],
);

export const aiDocuments = pgTable(
  "ai_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sourceType: text("source_type").notNull().default("text"),
    mimeType: text("mime_type").notNull(),
    status: aiDocumentStatusEnum("status").notNull().default("queued"),
    currentVersion: integer("current_version").notNull().default(1),
    errorCode: text("error_code"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ai_documents_account_status_idx").on(table.accountId, table.status),
  ],
);

export const aiDocumentVersions = pgTable(
  "ai_document_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => aiDocuments.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: text("content").notNull(),
    contentSha256: text("content_sha256").notNull(),
    byteSize: integer("byte_size").notNull(),
    status: aiDocumentStatusEnum("status").notNull().default("queued"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ai_document_versions_document_version_uidx").on(
      table.documentId,
      table.version,
    ),
    index("ai_document_versions_account_idx").on(table.accountId),
  ],
);

export const aiKnowledgeChunks = pgTable(
  "ai_knowledge_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => aiDocuments.id, { onDelete: "cascade" }),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => aiDocumentVersions.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    tokenEstimate: integer("token_estimate").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ai_chunks_version_index_uidx").on(
      table.documentVersionId,
      table.chunkIndex,
    ),
    index("ai_chunks_account_document_idx").on(table.accountId, table.documentId),
  ],
);

export const aiConversationControls = pgTable(
  "ai_conversation_controls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    mode: aiConversationModeEnum("mode").notNull().default("active"),
    generation: integer("generation").notNull().default(0),
    reasonCode: text("reason_code"),
    changedByUserId: uuid("changed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ai_conversation_controls_conversation_uidx").on(
      table.conversationId,
    ),
    index("ai_conversation_controls_account_idx").on(table.accountId),
  ],
);

export const aiMemories = pgTable(
  "ai_memories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    content: text("content").notNull(),
    sourceMessageId: uuid("source_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ai_memories_account_contact_idx").on(table.accountId, table.contactId),
    index("ai_memories_expiry_idx").on(table.accountId, table.expiresAt),
  ],
);

export const aiBudgetPeriods = pgTable(
  "ai_budget_periods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    limitMicros: bigint("limit_micros", { mode: "number" }).notNull(),
    reservedMicros: bigint("reserved_micros", { mode: "number" })
      .notNull()
      .default(0),
    spentMicros: bigint("spent_micros", { mode: "number" }).notNull().default(0),
    activeReservations: integer("active_reservations").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ai_budget_periods_account_start_uidx").on(
      table.accountId,
      table.periodStart,
    ),
  ],
);

export const aiRuns = pgTable(
  "ai_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => aiAgents.id, { onDelete: "cascade" }),
    agentVersionId: uuid("agent_version_id")
      .notNull()
      .references(() => aiAgentVersions.id, { onDelete: "restrict" }),
    budgetPeriodId: uuid("budget_period_id")
      .notNull()
      .references(() => aiBudgetPeriods.id, { onDelete: "restrict" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    sourceMessageId: uuid("source_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    status: aiRunStatusEnum("status").notNull().default("reserved"),
    idempotencyKey: text("idempotency_key").notNull(),
    controlGeneration: integer("control_generation"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    reservedMicros: bigint("reserved_micros", { mode: "number" }).notNull(),
    actualCostMicros: bigint("actual_cost_micros", { mode: "number" }),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    usageKnown: integer("usage_known").notNull().default(0),
    durationMs: integer("duration_ms"),
    resultCode: text("result_code"),
    errorCode: text("error_code"),
    outputText: text("output_text"),
    reservationExpiresAt: timestamp("reservation_expires_at", {
      withTimezone: true,
    }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ai_runs_account_idempotency_uidx").on(
      table.accountId,
      table.idempotencyKey,
    ),
    index("ai_runs_account_created_idx").on(table.accountId, table.createdAt),
    index("ai_runs_reservation_expiry_idx").on(
      table.status,
      table.reservationExpiresAt,
    ),
  ],
);

export const aiRunSources = pgTable(
  "ai_run_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => aiRuns.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => aiDocuments.id, { onDelete: "restrict" }),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => aiDocumentVersions.id, { onDelete: "restrict" }),
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => aiKnowledgeChunks.id, { onDelete: "restrict" }),
    rank: integer("rank").notNull(),
    scoreMicros: integer("score_micros"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ai_run_sources_run_chunk_uidx").on(table.runId, table.chunkId),
    index("ai_run_sources_account_idx").on(table.accountId),
  ],
);

export const aiJobs = pgTable(
  "ai_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: aiJobStatusEnum("status").notNull().default("queued"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ai_jobs_account_idempotency_uidx").on(
      table.accountId,
      table.idempotencyKey,
    ),
    index("ai_jobs_claim_idx").on(
      table.status,
      table.nextAttemptAt,
      table.leaseExpiresAt,
    ),
  ],
);

export type AiAgentVersion = typeof aiAgentVersions.$inferSelect;
export type AiKnowledgeChunk = typeof aiKnowledgeChunks.$inferSelect;
