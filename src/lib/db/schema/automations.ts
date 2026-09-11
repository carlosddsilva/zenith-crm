import { pgTable, text, timestamp, uuid, jsonb, boolean, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { accounts } from './identity';

export const automations = pgTable('automations', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status', { enum: ['draft', 'active', 'paused', 'archived'] }).notNull().default('draft'),
  triggerType: text('trigger_type').notNull(),
  triggerConfig: jsonb('trigger_config').notNull().default({}),
  conditions: jsonb('conditions').notNull().default([]),
  actions: jsonb('actions').notNull().default([]),
  createdByUserId: uuid('created_by_user_id').notNull(), // reference to profiles.id but we keep it soft for now since profiles is still auth.users in some places
  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
});

export const automationRuns = pgTable('automation_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  automationId: uuid('automation_id')
    .notNull()
    .references(() => automations.id, { onDelete: 'cascade' }),
  triggerType: text('trigger_type').notNull(),
  triggerEventId: text('trigger_event_id').notNull(), // Idempotency key
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  status: text('status', { enum: ['running', 'completed', 'failed'] }).notNull().default('running'),
  errorCode: text('error_code'),
  startedAt: timestamp('started_at', { withTimezone: true }).default(sql`now()`).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
}, (table) => {
  return {
    idempotencyIdx: uniqueIndex('idx_automation_runs_idempotency').on(table.automationId, table.triggerEventId),
    accountAutomationIdx: uniqueIndex('idx_automation_runs_account').on(table.accountId, table.automationId),
  };
});

export const automationActionRuns = pgTable('automation_action_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  automationRunId: uuid('automation_run_id')
    .notNull()
    .references(() => automationRuns.id, { onDelete: 'cascade' }),
  actionIndex: integer('action_index').notNull(),
  actionType: text('action_type').notNull(),
  status: text('status', { enum: ['running', 'completed', 'failed'] }).notNull().default('running'),
  errorCode: text('error_code'),
  startedAt: timestamp('started_at', { withTimezone: true }).default(sql`now()`).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
});
