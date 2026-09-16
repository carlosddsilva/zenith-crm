import { pgTable, text, timestamp, uuid, jsonb, integer, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { accounts } from './identity';
import { contacts } from './contacts';
import { deals } from './pipeline';

export const followupSequences = pgTable('followup_sequences', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status', { enum: ['draft', 'active', 'paused', 'archived'] }).notNull().default('draft'),
  
  triggerType: text('trigger_type').notNull(),
  conditions: jsonb('conditions').notNull().default([]),
  
  cancelOnReply: boolean('cancel_on_reply').notNull().default(true),
  cancelOnDealClosed: boolean('cancel_on_deal_closed').notNull().default(true),
  timeZone: text('time_zone').notNull().default('America/Sao_Paulo'),
  quietHoursStart: text('quiet_hours_start'), // e.g., "20:00"
  quietHoursEnd: text('quiet_hours_end'),     // e.g., "08:00"
  
  steps: jsonb('steps').notNull().default([]),
  
  createdByUserId: uuid('created_by_user_id').notNull(),
  publishedVersionId: uuid('published_version_id'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});

export const followupSequenceVersions = pgTable('followup_sequence_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sequenceId: uuid('sequence_id')
    .notNull()
    .references(() => followupSequences.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  
  triggerType: text('trigger_type').notNull(),
  conditions: jsonb('conditions').notNull().default([]),
  steps: jsonb('steps').notNull().default([]),
  
  cancelOnReply: boolean('cancel_on_reply').notNull().default(true),
  cancelOnDealClosed: boolean('cancel_on_deal_closed').notNull().default(true),
  timeZone: text('time_zone').notNull().default('America/Sao_Paulo'),
  quietHoursStart: text('quiet_hours_start'),
  quietHoursEnd: text('quiet_hours_end'),
  
  createdByUserId: uuid('created_by_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
}, (table) => {
  return {
    followupVersionIdx: uniqueIndex('idx_followup_versions_seq_ver').on(table.sequenceId, table.version),
  };
});

export const followupEnrollments = pgTable('followup_enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  sequenceId: uuid('sequence_id')
    .notNull()
    .references(() => followupSequences.id, { onDelete: 'cascade' }),
  versionId: uuid('version_id')
    .notNull()
    .references(() => followupSequenceVersions.id, { onDelete: 'cascade' }),
  
  contactId: uuid('contact_id')
    .notNull()
    .references(() => contacts.id, { onDelete: 'cascade' }),
  dealId: uuid('deal_id')
    .references(() => deals.id, { onDelete: 'cascade' }),
  
  triggerEventId: text('trigger_event_id').notNull(),
  
  status: text('status', { enum: ['active', 'paused', 'completed', 'cancelled', 'failed'] }).notNull().default('active'),
  cancelReason: text('cancel_reason'),
  
  currentStepIndex: integer('current_step_index').notNull().default(0),
  nextStepAt: timestamp('next_step_at', { withTimezone: true }),
  
  enrolledAt: timestamp('enrolled_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
}, (table) => {
  return {
    idempotencyIdx: uniqueIndex('idx_followup_enrollments_idempotency').on(table.sequenceId, table.triggerEventId),
    contactIdx: index('idx_followup_enrollments_contact').on(table.accountId, table.contactId, table.status),
  };
});

export const followupEnrollmentSteps = pgTable('followup_enrollment_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  enrollmentId: uuid('enrollment_id')
    .notNull()
    .references(() => followupEnrollments.id, { onDelete: 'cascade' }),
  stepIndex: integer('step_index').notNull(),
  
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] }).notNull().default('pending'),
  errorCode: text('error_code'),
  
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
  executedAt: timestamp('executed_at', { withTimezone: true }),
});
