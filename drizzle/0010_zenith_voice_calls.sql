CREATE TYPE "public"."call_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."call_participant_type" AS ENUM('contact', 'user', 'external', 'system');--> statement-breakpoint
CREATE TYPE "public"."call_state" AS ENUM('new', 'ringing', 'connecting', 'active', 'ended', 'failed', 'rejected');--> statement-breakpoint
CREATE TABLE "call_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"state" "call_state",
	"provider_event_id" text,
	"payload" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid NOT NULL,
	"participant_type" "call_participant_type" NOT NULL,
	"contact_id" uuid,
	"user_id" uuid,
	"provider_participant_id" text,
	"phone" text,
	"display_name" text,
	"role" text,
	"is_muted" boolean DEFAULT false NOT NULL,
	"is_on_hold" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"voice_channel_id" uuid NOT NULL,
	"provider" "voice_provider" NOT NULL,
	"provider_call_id" text,
	"direction" "call_direction" NOT NULL,
	"state" "call_state" DEFAULT 'new' NOT NULL,
	"contact_id" uuid,
	"assigned_agent_id" uuid,
	"created_by_user_id" uuid,
	"from_phone" text,
	"to_phone" text,
	"failure_reason" text,
	"end_reason" text,
	"started_at" timestamp with time zone,
	"ringing_at" timestamp with time zone,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_voice_channel_id_voice_channels_id_fk" FOREIGN KEY ("voice_channel_id") REFERENCES "public"."voice_channels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_assigned_agent_id_users_id_fk" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_events_call_idx" ON "call_events" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "call_events_occurred_idx" ON "call_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "call_events_provider_event_uidx" ON "call_events" USING btree ("call_id","provider_event_id") WHERE "call_events"."provider_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "call_participants_call_idx" ON "call_participants" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "call_participants_contact_idx" ON "call_participants" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "call_participants_user_idx" ON "call_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "calls_account_idx" ON "calls" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "calls_channel_idx" ON "calls" USING btree ("voice_channel_id");--> statement-breakpoint
CREATE INDEX "calls_account_state_idx" ON "calls" USING btree ("account_id","state");--> statement-breakpoint
CREATE INDEX "calls_contact_idx" ON "calls" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "calls_agent_idx" ON "calls" USING btree ("assigned_agent_id");--> statement-breakpoint
CREATE INDEX "calls_created_idx" ON "calls" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "calls_channel_provider_call_uidx" ON "calls" USING btree ("voice_channel_id","provider_call_id") WHERE "calls"."provider_call_id" IS NOT NULL;