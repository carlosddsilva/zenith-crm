CREATE TYPE "public"."voice_provider" AS ENUM('wacalls');--> statement-breakpoint
CREATE TABLE "voice_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"provider" "voice_provider" NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"credentials_encrypted" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_channels" ADD CONSTRAINT "voice_channels_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_channels" ADD CONSTRAINT "voice_channels_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "voice_channels_account_name_uidx" ON "voice_channels" USING btree ("account_id","name");--> statement-breakpoint
CREATE INDEX "voice_channels_account_idx" ON "voice_channels" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "voice_channels_provider_idx" ON "voice_channels" USING btree ("account_id","provider");