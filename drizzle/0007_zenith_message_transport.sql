ALTER TABLE "messages" ADD COLUMN "provider" "messaging_provider";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "messaging_channel_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "transport_error" text;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_messaging_channel_id_messaging_channels_id_fk" FOREIGN KEY ("messaging_channel_id") REFERENCES "public"."messaging_channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_channel_idx" ON "messages" USING btree ("messaging_channel_id");