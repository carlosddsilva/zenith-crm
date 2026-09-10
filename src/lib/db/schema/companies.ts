import { pgTable, uuid, text, timestamp, index, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { contacts } from './contacts';
import { deals } from './pipeline';
import { tasks, activities } from './activities';

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id').notNull(),
    name: text('name').notNull(),
    legalName: text('legal_name'),
    document: text('document'),
    email: text('email'),
    phone: text('phone'),
    website: text('website'),
    address: jsonb('address'),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('companies_account_id_idx').on(table.accountId),
    index('companies_name_idx').on(table.name),
    index('companies_document_idx').on(table.document),
  ]
);

export const companiesRelations = relations(companies, ({ many }) => ({
  contacts: many(contacts),
  deals: many(deals),
  tasks: many(tasks),
  activities: many(activities),
}));
