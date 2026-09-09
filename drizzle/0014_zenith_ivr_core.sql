CREATE TYPE "public"."ivr_execution_status" AS ENUM('running', 'waiting', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ivr_flow_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."ivr_step_status" AS ENUM('entered', 'waiting', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "ivr_execution_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"node_id" text NOT NULL,
	"node_type" text NOT NULL,
	"status" "ivr_step_status" DEFAULT 'entered' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ivr_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"call_id" uuid NOT NULL,
	"flow_id" uuid NOT NULL,
	"flow_version_id" uuid NOT NULL,
	"voice_channel_id" uuid NOT NULL,
	"provider" "voice_provider" NOT NULL,
	"status" "ivr_execution_status" DEFAULT 'running' NOT NULL,
	"current_node_id" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ivr_flow_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"flow_id" uuid NOT NULL,
	"voice_channel_id" uuid NOT NULL,
	"direction" "call_direction" DEFAULT 'inbound' NOT NULL,
	"routing_key" text DEFAULT '*' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ivr_flow_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "ivr_flow_status" DEFAULT 'draft' NOT NULL,
	"definition" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ivr_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "ivr_flow_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ivr_execution_steps" ADD CONSTRAINT "ivr_execution_steps_execution_id_ivr_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."ivr_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ivr_executions" ADD CONSTRAINT "ivr_executions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ivr_executions" ADD CONSTRAINT "ivr_executions_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ivr_executions" ADD CONSTRAINT "ivr_executions_flow_id_ivr_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."ivr_flows"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ivr_executions" ADD CONSTRAINT "ivr_executions_flow_version_id_ivr_flow_versions_id_fk" FOREIGN KEY ("flow_version_id") REFERENCES "public"."ivr_flow_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ivr_executions" ADD CONSTRAINT "ivr_executions_voice_channel_id_voice_channels_id_fk" FOREIGN KEY ("voice_channel_id") REFERENCES "public"."voice_channels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ivr_flow_bindings" ADD CONSTRAINT "ivr_flow_bindings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ivr_flow_bindings" ADD CONSTRAINT "ivr_flow_bindings_flow_id_ivr_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."ivr_flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ivr_flow_bindings" ADD CONSTRAINT "ivr_flow_bindings_voice_channel_id_voice_channels_id_fk" FOREIGN KEY ("voice_channel_id") REFERENCES "public"."voice_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ivr_flow_versions" ADD CONSTRAINT "ivr_flow_versions_flow_id_ivr_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."ivr_flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ivr_flow_versions" ADD CONSTRAINT "ivr_flow_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ivr_flows" ADD CONSTRAINT "ivr_flows_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ivr_flows" ADD CONSTRAINT "ivr_flows_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ivr_execution_steps_sequence_uidx" ON "ivr_execution_steps" USING btree ("execution_id","sequence");--> statement-breakpoint
CREATE INDEX "ivr_execution_steps_execution_idx" ON "ivr_execution_steps" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "ivr_execution_steps_node_idx" ON "ivr_execution_steps" USING btree ("node_type");--> statement-breakpoint
CREATE UNIQUE INDEX "ivr_executions_call_uidx" ON "ivr_executions" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "ivr_executions_account_idx" ON "ivr_executions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "ivr_executions_status_idx" ON "ivr_executions" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "ivr_executions_flow_idx" ON "ivr_executions" USING btree ("flow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ivr_flow_bindings_route_uidx" ON "ivr_flow_bindings" USING btree ("account_id","voice_channel_id","direction","routing_key");--> statement-breakpoint
CREATE INDEX "ivr_flow_bindings_flow_idx" ON "ivr_flow_bindings" USING btree ("flow_id");--> statement-breakpoint
CREATE INDEX "ivr_flow_bindings_channel_idx" ON "ivr_flow_bindings" USING btree ("voice_channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ivr_flow_versions_flow_version_uidx" ON "ivr_flow_versions" USING btree ("flow_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "ivr_flow_versions_published_uidx" ON "ivr_flow_versions" USING btree ("flow_id") WHERE "ivr_flow_versions"."status" = 'published';--> statement-breakpoint
CREATE INDEX "ivr_flow_versions_flow_idx" ON "ivr_flow_versions" USING btree ("flow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ivr_flows_account_name_uidx" ON "ivr_flows" USING btree ("account_id","name");--> statement-breakpoint
CREATE INDEX "ivr_flows_account_idx" ON "ivr_flows" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "ivr_flows_status_idx" ON "ivr_flows" USING btree ("account_id","status");