DROP INDEX "account_members_user_id_idx";--> statement-breakpoint
DROP INDEX "account_members_account_id_idx";--> statement-breakpoint
DROP INDEX "accounts_owner_user_id_idx";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "default_currency" text DEFAULT 'BRL' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "account_members_user_id_unique" ON "account_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_owner_user_id_unique" ON "accounts" USING btree ("owner_user_id");