CREATE TYPE "public"."system_role" AS ENUM('user', 'superadmin');--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"max_users" text NOT NULL,
	"max_contacts" text NOT NULL,
	"max_monthly_messages" text NOT NULL,
	"price" text NOT NULL,
	"is_public" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "system_role" "system_role" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;