DROP INDEX "idx_automation_runs_account";--> statement-breakpoint
CREATE INDEX "tasks_account_status_due_idx" ON "tasks" USING btree ("account_id","status","due_at");--> statement-breakpoint
CREATE INDEX "deals_account_pipeline_stage_status_idx" ON "deals" USING btree ("account_id","pipeline_id","stage_id","status");--> statement-breakpoint
CREATE INDEX "broadcast_recipients_account_broadcast_status_idx" ON "broadcast_recipients" USING btree ("account_id","broadcast_id","status");--> statement-breakpoint
CREATE INDEX "broadcasts_account_status_created_idx" ON "broadcasts" USING btree ("account_id","status","created_at");--> statement-breakpoint
CREATE INDEX "automation_outbox_status_created_idx" ON "automation_events_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "automations_account_status_trigger_idx" ON "automations" USING btree ("account_id","status","trigger_type");--> statement-breakpoint
CREATE INDEX "idx_automation_runs_account" ON "automation_runs" USING btree ("account_id","automation_id","started_at");