import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { accounts, users } from "./identity";
import { companies } from "./companies";

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, {
        onDelete: "cascade",
      }),

    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "restrict",
      }),

    phone: text("phone").notNull(),
    phoneNormalized: text("phone_normalized").notNull(),

    name: text("name"),
    email: text("email"),
    company: text("company"),
    avatarUrl: text("avatar_url"),

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
    uniqueIndex(
      "contacts_account_phone_normalized_unique",
    ).on(
      table.accountId,
      table.phoneNormalized,
    ),

    index("contacts_account_id_idx").on(
      table.accountId,
    ),

    index("contacts_phone_normalized_idx").on(
      table.phoneNormalized,
    ),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, {
        onDelete: "cascade",
      }),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "restrict",
      }),

    name: text("name").notNull(),

    color: text("color")
      .notNull()
      .default("#3b82f6"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("tags_account_id_idx").on(
      table.accountId,
    ),
  ],
);

export const contactTags = pgTable(
  "contact_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, {
        onDelete: "cascade",
      }),

    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, {
        onDelete: "cascade",
      }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex(
      "contact_tags_contact_tag_unique",
    ).on(
      table.contactId,
      table.tagId,
    ),

    index("contact_tags_contact_id_idx").on(
      table.contactId,
    ),

    index("contact_tags_tag_id_idx").on(
      table.tagId,
    ),
  ],
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Tag = typeof tags.$inferSelect;
