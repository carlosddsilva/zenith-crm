CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."ai_agent_status" AS ENUM('inactive', 'active');--> statement-breakpoint
CREATE TYPE "public"."ai_conversation_mode" AS ENUM('active', 'paused', 'handoff');--> statement-breakpoint
CREATE TYPE "public"."ai_document_status" AS ENUM('queued', 'indexing', 'ready', 'failed', 'removed');--> statement-breakpoint
CREATE TYPE "public"."ai_job_status" AS ENUM('queued', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ai_run_status" AS ENUM('reserved', 'running', 'completed', 'failed', 'cancelled', 'handoff');--> statement-breakpoint
CREATE TABLE "ai_agent_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"instructions" text NOT NULL,
	"authorized_channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generation_provider" text NOT NULL,
	"generation_model" text NOT NULL,
	"embeddings_provider" text NOT NULL,
	"embeddings_model" text NOT NULL,
	"input_price_micros_per_million" bigint NOT NULL,
	"output_price_micros_per_million" bigint NOT NULL,
	"embedding_price_micros_per_million" bigint NOT NULL,
	"per_call_limit_micros" bigint NOT NULL,
	"monthly_limit_micros" bigint NOT NULL,
	"max_input_tokens" integer NOT NULL,
	"max_output_tokens" integer NOT NULL,
	"max_concurrency" integer NOT NULL,
	"memory_retention_days" integer NOT NULL,
	"handoff_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text DEFAULT 'Agente Zenith' NOT NULL,
	"status" "ai_agent_status" DEFAULT 'inactive' NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"generation_api_key_encrypted" text,
	"embeddings_api_key_encrypted" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_budget_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"limit_micros" bigint NOT NULL,
	"reserved_micros" bigint DEFAULT 0 NOT NULL,
	"spent_micros" bigint DEFAULT 0 NOT NULL,
	"active_reservations" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_conversation_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"mode" "ai_conversation_mode" DEFAULT 'active' NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"reason_code" text,
	"changed_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"content_sha256" text NOT NULL,
	"byte_size" integer NOT NULL,
	"status" "ai_document_status" DEFAULT 'queued' NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source_type" text DEFAULT 'text' NOT NULL,
	"mime_type" text NOT NULL,
	"status" "ai_document_status" DEFAULT 'queued' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"error_code" text,
	"created_by_user_id" uuid NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"type" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "ai_job_status" DEFAULT 'queued' NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"token_estimate" integer NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"conversation_id" uuid,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"source_message_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_run_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"chunk_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"score_micros" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"budget_period_id" uuid NOT NULL,
	"conversation_id" uuid,
	"source_message_id" uuid,
	"kind" text NOT NULL,
	"status" "ai_run_status" DEFAULT 'reserved' NOT NULL,
	"idempotency_key" text NOT NULL,
	"control_generation" integer,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"reserved_micros" bigint NOT NULL,
	"actual_cost_micros" bigint,
	"input_tokens" integer,
	"output_tokens" integer,
	"usage_known" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"result_code" text,
	"error_code" text,
	"output_text" text,
	"reservation_expires_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "ai_run_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD CONSTRAINT "ai_agent_versions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD CONSTRAINT "ai_agent_versions_agent_id_ai_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD CONSTRAINT "ai_agent_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_budget_periods" ADD CONSTRAINT "ai_budget_periods_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversation_controls" ADD CONSTRAINT "ai_conversation_controls_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversation_controls" ADD CONSTRAINT "ai_conversation_controls_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversation_controls" ADD CONSTRAINT "ai_conversation_controls_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_document_versions" ADD CONSTRAINT "ai_document_versions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_document_versions" ADD CONSTRAINT "ai_document_versions_document_id_ai_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."ai_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_documents" ADD CONSTRAINT "ai_documents_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_documents" ADD CONSTRAINT "ai_documents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_chunks" ADD CONSTRAINT "ai_knowledge_chunks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_chunks" ADD CONSTRAINT "ai_knowledge_chunks_document_id_ai_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."ai_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_chunks" ADD CONSTRAINT "ai_knowledge_chunks_document_version_id_ai_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."ai_document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run_sources" ADD CONSTRAINT "ai_run_sources_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run_sources" ADD CONSTRAINT "ai_run_sources_run_id_ai_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run_sources" ADD CONSTRAINT "ai_run_sources_document_id_ai_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."ai_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run_sources" ADD CONSTRAINT "ai_run_sources_document_version_id_ai_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."ai_document_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run_sources" ADD CONSTRAINT "ai_run_sources_chunk_id_ai_knowledge_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."ai_knowledge_chunks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_agent_id_ai_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_agent_version_id_ai_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."ai_agent_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_budget_period_id_ai_budget_periods_id_fk" FOREIGN KEY ("budget_period_id") REFERENCES "public"."ai_budget_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_versions_agent_version_uidx" ON "ai_agent_versions" USING btree ("agent_id","version");--> statement-breakpoint
CREATE INDEX "ai_agent_versions_account_idx" ON "ai_agent_versions" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agents_account_uidx" ON "ai_agents" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_budget_periods_account_start_uidx" ON "ai_budget_periods" USING btree ("account_id","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_conversation_controls_conversation_uidx" ON "ai_conversation_controls" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_conversation_controls_account_idx" ON "ai_conversation_controls" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_document_versions_document_version_uidx" ON "ai_document_versions" USING btree ("document_id","version");--> statement-breakpoint
CREATE INDEX "ai_document_versions_account_idx" ON "ai_document_versions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "ai_documents_account_status_idx" ON "ai_documents" USING btree ("account_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_jobs_account_idempotency_uidx" ON "ai_jobs" USING btree ("account_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "ai_jobs_claim_idx" ON "ai_jobs" USING btree ("status","next_attempt_at","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_chunks_version_index_uidx" ON "ai_knowledge_chunks" USING btree ("document_version_id","chunk_index");--> statement-breakpoint
CREATE INDEX "ai_chunks_account_document_idx" ON "ai_knowledge_chunks" USING btree ("account_id","document_id");--> statement-breakpoint
CREATE INDEX "ai_chunks_fts_idx" ON "ai_knowledge_chunks" USING gin (to_tsvector('simple', "content"));--> statement-breakpoint
CREATE INDEX "ai_chunks_embedding_hnsw_idx" ON "ai_knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops) WHERE "embedding" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ai_memories_account_contact_idx" ON "ai_memories" USING btree ("account_id","contact_id");--> statement-breakpoint
CREATE INDEX "ai_memories_expiry_idx" ON "ai_memories" USING btree ("account_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_run_sources_run_chunk_uidx" ON "ai_run_sources" USING btree ("run_id","chunk_id");--> statement-breakpoint
CREATE INDEX "ai_run_sources_account_idx" ON "ai_run_sources" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_runs_account_idempotency_uidx" ON "ai_runs" USING btree ("account_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "ai_runs_account_created_idx" ON "ai_runs" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_runs_reservation_expiry_idx" ON "ai_runs" USING btree ("status","reservation_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_ai_run_uidx" ON "messages" USING btree ("ai_run_id") WHERE "messages"."ai_run_id" IS NOT NULL;
