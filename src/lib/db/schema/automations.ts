import { pgTable, text, timestamp, uuid, jsonb, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
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
  publishedVersionId: uuid('published_version_id'), // points to automationVersions.id
}, (table) => [
  index('automations_account_status_trigger_idx').on(table.accountId, table.status, table.triggerType),
]);

export const automationVersions = pgTable('automation_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  automationId: uuid('automation_id')
    .notNull()
    .references(() => automations.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  triggerType: text('trigger_type').notNull(),
  triggerConfig: jsonb('trigger_config').notNull().default({}),
  conditions: jsonb('conditions').notNull().default([]),
  actions: jsonb('actions').notNull().default([]),
  createdByUserId: uuid('created_by_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
}, (table) => {
  return {
    automationVersionIdx: uniqueIndex('idx_automation_versions_auto_ver').on(table.automationId, table.version),
  };
});

export const automationRuns = pgTable('automation_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  automationId: uuid('automation_id')
    .notNull()
    .references(() => automations.id, { onDelete: 'cascade' }),
  automationVersionId: uuid('automation_version_id')
    .notNull()
    .references(() => automationVersions.id, { onDelete: 'cascade' }),
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
    accountAutomationIdx: index('idx_automation_runs_account').on(table.accountId, table.automationId, table.startedAt),
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

export const automationEventsOutbox = pgTable('automation_events_outbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  eventId: text('event_id').notNull().unique(), // The stable trigger event ID
  eventType: text('event_type').notNull(),
  
  // Semantic Event Envelope
  aggregateType: text('aggregate_type'),
  aggregateId: text('aggregate_id'),
  correlationId: text('correlation_id'),
  causationId: text('causation_id'),

  payload: jsonb('payload').notNull(),
  depth: integer('depth').notNull().default(0),
  
  // State and Lease
  status: text('status', { enum: ['pending', 'processing', 'processed', 'failed'] }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
  lastError: text('last_error'),

  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`).notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
}, (table) => [
  index('automation_outbox_status_created_idx').on(table.status, table.createdAt),
  index('automation_outbox_polling_idx').on(table.status, table.nextAttemptAt, table.leaseExpiresAt),
]);
