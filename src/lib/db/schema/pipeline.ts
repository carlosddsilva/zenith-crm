import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  integer,
  numeric,
} from 'drizzle-orm/pg-core';

import { accounts, users } from './identity';
import { contacts } from './contacts';
import { companies } from './companies';

export const pipelines = pgTable(
  'pipelines',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, {
        onDelete: 'cascade',
      }),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, {
        onDelete: 'restrict',
      }),

    name: text('name').notNull(),
    description: text('description'),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('pipelines_account_id_idx').on(table.accountId)]
);

export const pipelineStages = pgTable(
  'pipeline_stages',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    pipelineId: uuid('pipeline_id')
      .notNull()
      .references(() => pipelines.id, {
        onDelete: 'cascade',
      }),

    name: text('name').notNull(),
    color: text('color').notNull().default('#3b82f6'),
    position: integer('position').notNull().default(0),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('pipeline_stages_pipeline_id_idx').on(table.pipelineId)]
);

export const deals = pgTable(
  'deals',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, {
        onDelete: 'cascade',
      }),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, {
        onDelete: 'restrict',
      }),

    companyId: uuid('company_id').references(() => companies.id, {
      onDelete: 'set null',
    }),

    pipelineId: uuid('pipeline_id')
      .notNull()
      .references(() => pipelines.id, {
        onDelete: 'restrict',
      }),

    stageId: uuid('stage_id')
      .notNull()
      .references(() => pipelineStages.id, {
        onDelete: 'restrict',
      }),

    contactId: uuid('contact_id').references(() => contacts.id, {
      onDelete: 'set null',
    }),

    assignedTo: uuid('assigned_to').references(() => users.id, {
      onDelete: 'set null',
    }),

    title: text('title').notNull(),
    value: numeric('value', { precision: 12, scale: 2 }).default('0').notNull(),
    currency: text('currency').notNull(),
    status: text('status').notNull().default('open'), // open, won, lost
    notes: text('notes'),
    expectedCloseDate: timestamp('expected_close_date', {
      withTimezone: true,
    }),

    wonAt: timestamp('won_at', {
      withTimezone: true,
    }),

    lostAt: timestamp('lost_at', {
      withTimezone: true,
    }),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('deals_account_id_idx').on(table.accountId),
    index('deals_pipeline_id_idx').on(table.pipelineId),
    index('deals_stage_id_idx').on(table.stageId),
    index('deals_contact_id_idx').on(table.contactId),
    index('deals_assigned_to_idx').on(table.assignedTo),
    index('deals_status_idx').on(table.status),
    index('deals_account_pipeline_stage_status_idx').on(table.accountId, table.pipelineId, table.stageId, table.status),
  ]
);

export type Pipeline = typeof pipelines.$inferSelect;
export type NewPipeline = typeof pipelines.$inferInsert;
export type PipelineStage = typeof pipelineStages.$inferSelect;
export type NewPipelineStage = typeof pipelineStages.$inferInsert;
export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
