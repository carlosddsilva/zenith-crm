CREATE TYPE "public"."voice_channel_health" AS ENUM('unknown', 'online', 'degraded', 'offline');--> statement-breakpoint
ALTER TABLE "voice_channels" ADD COLUMN "allow_inbound" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_channels" ADD COLUMN "allow_outbound" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_channels" ADD COLUMN "priority" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_channels" ADD COLUMN "max_concurrent_calls" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_channels" ADD COLUMN "health_status" "voice_channel_health" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_channels" ADD COLUMN "last_health_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "voice_channels_routing_idx" ON "voice_channels" USING btree ("account_id","is_active","allow_outbound","priority");--> statement-breakpoint
ALTER TABLE "voice_channels" ADD CONSTRAINT "voice_channels_priority_check" CHECK ("voice_channels"."priority" >= 0);--> statement-breakpoint
ALTER TABLE "voice_channels" ADD CONSTRAINT "voice_channels_max_concurrent_calls_check" CHECK ("voice_channels"."max_concurrent_calls" >= 1);