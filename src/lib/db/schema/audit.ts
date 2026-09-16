import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { accounts, users } from "./identity";
import { contacts } from "./contacts";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, {
        onDelete: "cascade",
      }),

    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),

    metadata: jsonb("metadata").$type<any>(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_logs_account_id_idx").on(table.accountId),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ],
);

export const privacyRequests = pgTable(
  "privacy_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, {
        onDelete: "cascade",
      }),

    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, {
        onDelete: "cascade",
      }),

    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "restrict",
      }),

    type: text("type").notNull(), // EXPORT, DELETION, ANONYMIZATION
    status: text("status").notNull().default("pending"), // pending, processing, completed, failed

    fileUrl: text("file_url"), // Local path or external URL for export download
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("privacy_requests_account_id_idx").on(table.accountId),
    index("privacy_requests_contact_id_idx").on(table.contactId),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type PrivacyRequest = typeof privacyRequests.$inferSelect;
export type NewPrivacyRequest = typeof privacyRequests.$inferInsert;
