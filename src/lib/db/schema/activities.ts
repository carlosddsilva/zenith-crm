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
import { deals } from "./pipeline";
import { companies } from "./companies";

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, {
        onDelete: "cascade",
      }),

    title: text("title").notNull(),
    description: text("description"),

    status: text("status").notNull().default("pending"),
    priority: text("priority").notNull().default("normal"),

    dueAt: timestamp("due_at", {
      withTimezone: true,
    }),

    completedAt: timestamp("completed_at", {
      withTimezone: true,
    }),

    assignedUserId: uuid("assigned_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),

    dealId: uuid("deal_id").references(() => deals.id, {
      onDelete: "set null",
    }),

    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),

    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "restrict",
      }),

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
    index("tasks_account_id_idx").on(table.accountId),
    index("tasks_assigned_user_id_idx").on(table.assignedUserId),
    index("tasks_contact_id_idx").on(table.contactId),
    index("tasks_deal_id_idx").on(table.dealId),
    index("tasks_status_idx").on(table.status),
    index("tasks_due_at_idx").on(table.dueAt),
  ],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, {
        onDelete: "cascade",
      }),

    content: text("content").notNull(),

    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),

    dealId: uuid("deal_id").references(() => deals.id, {
      onDelete: "set null",
    }),

    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),

    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "restrict",
      }),

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
    index("notes_account_id_idx").on(table.accountId),
    index("notes_contact_id_idx").on(table.contactId),
    index("notes_deal_id_idx").on(table.dealId),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, {
        onDelete: "cascade",
      }),

    type: text("type").notNull(),

    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),

    dealId: uuid("deal_id").references(() => deals.id, {
      onDelete: "set null",
    }),

    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),

    taskId: uuid("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),

    metadata: jsonb("metadata").$type<any>(),

    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("activities_account_id_idx").on(table.accountId),
    index("activities_contact_id_idx").on(table.contactId),
    index("activities_deal_id_idx").on(table.dealId),
    index("activities_task_id_idx").on(table.taskId),
    index("activities_occurred_at_idx").on(table.occurredAt),
  ],
);
