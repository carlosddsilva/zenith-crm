import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { accounts } from "./identity";

export const slaPolicies = pgTable(
  "sla_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, {
        onDelete: "cascade",
      }),

    name: text("name").notNull(),
    description: text("description"),

    warningThresholdMinutes: integer("warning_threshold_minutes").notNull().default(15),
    overdueThresholdMinutes: integer("overdue_threshold_minutes").notNull().default(60),

    timeZone: text("time_zone").notNull().default("America/Sao_Paulo"),

    // ex: "08:00"
    businessHoursStart: text("business_hours_start"),
    // ex: "18:00"
    businessHoursEnd: text("business_hours_end"),
    
    // To identify the default policy for an account
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sla_policies_account_idx").on(table.accountId),
  ],
);
