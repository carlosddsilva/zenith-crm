ALTER TABLE "automation_events_outbox" ADD COLUMN "aggregate_type" text;--> statement-breakpoint
ALTER TABLE "automation_events_outbox" ADD COLUMN "aggregate_id" text;--> statement-breakpoint
ALTER TABLE "automation_events_outbox" ADD COLUMN "correlation_id" text;--> statement-breakpoint
ALTER TABLE "automation_events_outbox" ADD COLUMN "causation_id" text;--> statement-breakpoint
ALTER TABLE "automation_events_outbox" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "automation_events_outbox" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "automation_events_outbox" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "automation_events_outbox" ADD COLUMN "last_error" text;--> statement-breakpoint
CREATE INDEX "automation_outbox_polling_idx" ON "automation_events_outbox" USING btree ("status","next_attempt_at","lease_expires_at");