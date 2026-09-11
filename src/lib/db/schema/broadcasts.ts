import { pgTable, uuid, text, timestamp, varchar, integer, jsonb, unique } from 'drizzle-orm/pg-core';
import { accounts } from './identity';
import { users } from './identity';
import { messagingChannels } from './messaging';
import { contacts } from './contacts';
import { messages } from './inbox';

export const broadcasts = pgTable('broadcasts', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('draft'), // draft, scheduled, running, completed, cancelled, failed
  messagingChannelId: uuid('messaging_channel_id').references(() => messagingChannels.id, { onDelete: 'set null' }),
  content: jsonb('content'), // { templateName, language, text, etc }
  audience: jsonb('audience'), // { tags: string[], excludeTags: string[], type: 'tags' | 'manual', manualContacts?: string[] }
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const broadcastRecipients = pgTable('broadcast_recipients', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  broadcastId: uuid('broadcast_id').notNull().references(() => broadcasts.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  destination: varchar('destination', { length: 100 }), // normalized phone
  status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, processing, sent, delivered, failed, cancelled
  messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
  params: jsonb('params'), // Array of parameters resolved for this specific contact
  attemptCount: integer('attempt_count').notNull().default(0),
  lastErrorCode: text('last_error_code'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    unq_broadcast_contact: unique('unq_broadcast_contact').on(table.broadcastId, table.contactId)
  }
});
