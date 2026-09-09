import { sql } from "drizzle-orm";

import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  accounts,
  users,
} from "./identity";

export const messagingProviderEnum =
  pgEnum(
    "messaging_provider",
    [
      "meta",
      "evolution",
    ],
  );

export const messagingChannels =
  pgTable(
    "messaging_channels",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),

      accountId: uuid("account_id")
        .notNull()
        .references(
          () => accounts.id,
          {
            onDelete: "cascade",
          },
        ),

      createdByUserId: uuid(
        "created_by_user_id",
      )
        .notNull()
        .references(
          () => users.id,
          {
            onDelete: "restrict",
          },
        ),

      name: text("name")
        .notNull(),

      provider:
        messagingProviderEnum(
          "provider",
        ).notNull(),

      config: jsonb("config")
        .$type<
          Record<
            string,
            string | number | boolean | null
          >
        >()
        .notNull(),

      credentialsEncrypted:
        text(
          "credentials_encrypted",
        ).notNull(),

      isActive: boolean(
        "is_active",
      )
        .notNull()
        .default(true),

      isDefaultService:
        boolean(
          "is_default_service",
        )
          .notNull()
          .default(false),

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
        "messaging_channels_account_name_uidx",
      ).on(
        table.accountId,
        table.name,
      ),

      uniqueIndex(
        "messaging_channels_account_default_uidx",
      )
        .on(table.accountId)
        .where(
          sql`${table.isDefaultService} = true`,
        ),

      index(
        "messaging_channels_account_idx",
      ).on(
        table.accountId,
      ),

      index(
        "messaging_channels_provider_idx",
      ).on(
        table.accountId,
        table.provider,
      ),
    ],
  );
