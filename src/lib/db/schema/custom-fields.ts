import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { accounts, users } from "./identity";
import { contacts } from "./contacts";

export const customFields = pgTable(
  "custom_fields",
  {
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),

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

    fieldName: text("field_name")
      .notNull(),

    fieldType: text("field_type")
      .notNull()
      .default("text"),

    fieldOptions: jsonb("field_options")
      .$type<Record<string, unknown> | null>(),

    createdAt: timestamp(
      "created_at",
      {
        withTimezone: true,
      },
    )
      .notNull()
      .defaultNow(),

    updatedAt: timestamp(
      "updated_at",
      {
        withTimezone: true,
      },
    )
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex(
      "custom_fields_account_name_uidx",
    ).on(
      table.accountId,
      table.fieldName,
    ),

    index(
      "custom_fields_account_idx",
    ).on(table.accountId),
  ],
);

export const contactCustomValues =
  pgTable(
    "contact_custom_values",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),

      contactId: uuid("contact_id")
        .notNull()
        .references(() => contacts.id, {
          onDelete: "cascade",
        }),

      customFieldId: uuid(
        "custom_field_id",
      )
        .notNull()
        .references(() => customFields.id, {
          onDelete: "cascade",
        }),

      value: text("value"),

      createdAt: timestamp(
        "created_at",
        {
          withTimezone: true,
        },
      )
        .notNull()
        .defaultNow(),

      updatedAt: timestamp(
        "updated_at",
        {
          withTimezone: true,
        },
      )
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex(
        "contact_custom_values_contact_field_uidx",
      ).on(
        table.contactId,
        table.customFieldId,
      ),

      index(
        "contact_custom_values_contact_idx",
      ).on(table.contactId),

      index(
        "contact_custom_values_field_idx",
      ).on(table.customFieldId),
    ],
  );
