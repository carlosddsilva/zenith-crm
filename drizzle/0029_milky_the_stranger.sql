CREATE TABLE "google_calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"credentials_encrypted" text,
	"scopes" text NOT NULL,
	"access_token_expires_at" timestamp with time zone,
	"status" text DEFAULT 'connected' NOT NULL,
	"selected_calendar_id" text,
	"selected_calendar_summary" text,
	"selected_calendar_timezone" text,
	"sync_token" text,
	"sync_generation" integer DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"next_reconcile_at" timestamp with time zone,
	"last_error_code" text,
	"refresh_lease_owner" text,
	"refresh_lease_until" timestamp with time zone,
	"watch_channel_id" text,
	"watch_resource_id" text,
	"watch_token_hash" text,
	"watch_expires_at" timestamp with time zone,
	"watch_last_message_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_calendar_event_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"google_calendar_id" text NOT NULL,
	"google_event_id" text NOT NULL,
	"google_etag" text,
	"google_updated_at" timestamp with time zone,
	"sync_state" text DEFAULT 'pending' NOT NULL,
	"origin" text DEFAULT 'zenith' NOT NULL,
	"base_snapshot" jsonb,
	"pending_local_snapshot" jsonb,
	"conflict_remote_snapshot" jsonb,
	"read_only_reason" text,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_calendar_oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_hash" text NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"code_verifier_encrypted" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_calendar_sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"appointment_id" uuid,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"last_error_code" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "all_day" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "all_day_start" date;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "all_day_end" date;--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_event_links" ADD CONSTRAINT "google_calendar_event_links_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_event_links" ADD CONSTRAINT "google_calendar_event_links_connection_id_google_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_event_links" ADD CONSTRAINT "google_calendar_event_links_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_oauth_states" ADD CONSTRAINT "google_calendar_oauth_states_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_oauth_states" ADD CONSTRAINT "google_calendar_oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_oauth_states" ADD CONSTRAINT "google_calendar_oauth_states_session_id_auth_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_sync_jobs" ADD CONSTRAINT "google_calendar_sync_jobs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_sync_jobs" ADD CONSTRAINT "google_calendar_sync_jobs_connection_id_google_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_sync_jobs" ADD CONSTRAINT "google_calendar_sync_jobs_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "google_calendar_connections_account_user_unique" ON "google_calendar_connections" USING btree ("account_id","user_id");--> statement-breakpoint
CREATE INDEX "google_calendar_connections_account_idx" ON "google_calendar_connections" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "google_calendar_connections_reconcile_idx" ON "google_calendar_connections" USING btree ("status","next_reconcile_at");--> statement-breakpoint
CREATE UNIQUE INDEX "google_calendar_event_links_appointment_unique" ON "google_calendar_event_links" USING btree ("appointment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "google_calendar_event_links_external_unique" ON "google_calendar_event_links" USING btree ("connection_id","google_calendar_id","google_event_id");--> statement-breakpoint
CREATE INDEX "google_calendar_event_links_account_state_idx" ON "google_calendar_event_links" USING btree ("account_id","sync_state");--> statement-breakpoint
CREATE UNIQUE INDEX "google_calendar_oauth_states_hash_unique" ON "google_calendar_oauth_states" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "google_calendar_oauth_states_expiry_idx" ON "google_calendar_oauth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "google_calendar_sync_jobs_dedupe_unique" ON "google_calendar_sync_jobs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "google_calendar_sync_jobs_poll_idx" ON "google_calendar_sync_jobs" USING btree ("status","next_attempt_at","lease_expires_at");--> statement-breakpoint
CREATE INDEX "google_calendar_sync_jobs_tenant_idx" ON "google_calendar_sync_jobs" USING btree ("account_id","connection_id");