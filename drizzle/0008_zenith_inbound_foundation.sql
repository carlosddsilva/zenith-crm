CREATE TYPE "public"."messaging_webhook_status" AS ENUM('received', 'processed', 'ignored', 'failed');--> statement-breakpoint
CREATE TABLE "messaging_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"messaging_channel_id" uuid NOT NULL,
	"provider" "messaging_provider" NOT NULL,
	"event_key" text NOT NULL,
	"event_type" text,
	"payload_hash" text NOT NULL,
	"status" "messaging_webhook_status" DEFAULT 'received' NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "messaging_webhook_events" ADD CONSTRAINT "messaging_webhook_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_webhook_events" ADD CONSTRAINT "messaging_webhook_events_messaging_channel_id_messaging_channels_id_fk" FOREIGN KEY ("messaging_channel_id") REFERENCES "public"."messaging_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_webhook_events_channel_event_uidx" ON "messaging_webhook_events" USING btree ("messaging_channel_id","event_key");--> statement-breakpoint
CREATE INDEX "messaging_webhook_events_account_idx" ON "messaging_webhook_events" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "messaging_webhook_events_channel_idx" ON "messaging_webhook_events" USING btree ("messaging_channel_id");--> statement-breakpoint
CREATE INDEX "messaging_webhook_events_received_idx" ON "messaging_webhook_events" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_channel_message_uidx" ON "messages" USING btree ("messaging_channel_id","message_id") WHERE "messages"."message_id" IS NOT NULL AND "messages"."messaging_channel_id" IS NOT NULL;