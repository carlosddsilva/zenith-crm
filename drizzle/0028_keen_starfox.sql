CREATE TYPE "public"."conversation_sla_status" AS ENUM('ok', 'warning', 'overdue');--> statement-breakpoint
CREATE TABLE "sla_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"warning_threshold_minutes" integer DEFAULT 15 NOT NULL,
	"overdue_threshold_minutes" integer DEFAULT 60 NOT NULL,
	"time_zone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"business_hours_start" text,
	"business_hours_end" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "first_unreplied_message_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "sla_status" "conversation_sla_status" DEFAULT 'ok' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "sla_policy_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "last_sla_breach_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sla_policies_account_idx" ON "sla_policies" USING btree ("account_id");