import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const accountRoleEnum = pgEnum("account_role", [
  "owner",
  "admin",
  "agent",
  "viewer",
]);

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "disabled",
  "pending",
]);

export const accountStatusEnum = pgEnum("account_status", [
  "active",
  "suspended",
  "disabled",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    name: text("name"),
    passwordHash: text("password_hash"),
    status: userStatusEnum("status").notNull().default("active"),

    emailVerifiedAt: timestamp("email_verified_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).notNull().defaultNow(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    name: text("name").notNull(),

    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "restrict",
      }),

    defaultCurrency: text("default_currency")
      .notNull()
      .default("BRL"),

    status: accountStatusEnum("status")
      .notNull()
      .default("active"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).notNull().defaultNow(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("accounts_owner_user_id_unique").on(
      table.ownerUserId,
    ),
  ],
);

export const accountMembers = pgTable(
  "account_members",
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
        onDelete: "cascade",
      }),

    role: accountRoleEnum("role")
      .notNull()
      .default("agent"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).notNull().defaultNow(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex(
      "account_members_account_user_unique",
    ).on(table.accountId, table.userId),

    uniqueIndex(
      "account_members_user_id_unique",
    ).on(table.userId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type AccountMember =
  typeof accountMembers.$inferSelect;

export type NewAccountMember =
  typeof accountMembers.$inferInsert;
