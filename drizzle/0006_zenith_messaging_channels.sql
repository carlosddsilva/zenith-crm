CREATE TYPE "public"."messaging_provider" AS ENUM('meta', 'evolution');--> statement-breakpoint
CREATE TABLE "messaging_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"provider" "messaging_provider" NOT NULL,
	"config" jsonb NOT NULL,
	"credentials_encrypted" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default_service" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messaging_channels" ADD CONSTRAINT "messaging_channels_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_channels" ADD CONSTRAINT "messaging_channels_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_channels_account_name_uidx" ON "messaging_channels" USING btree ("account_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_channels_account_default_uidx" ON "messaging_channels" USING btree ("account_id") WHERE "messaging_channels"."is_default_service" = true;--> statement-breakpoint
CREATE INDEX "messaging_channels_account_idx" ON "messaging_channels" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "messaging_channels_provider_idx" ON "messaging_channels" USING btree ("account_id","provider");