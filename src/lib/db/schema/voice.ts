import {
  sql,
} from "drizzle-orm";

import {
  boolean,
  check,
  index,
  integer,
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

export const voiceProviderEnum =
  pgEnum(
    "voice_provider",
    [
      "wacalls",
      "asterisk",
    ],
  );

export const voiceChannelHealthEnum =
  pgEnum(
    "voice_channel_health",
    [
      "unknown",
      "online",
      "degraded",
      "offline",
    ],
  );

export const voiceChannels =
  pgTable(
    "voice_channels",
    {
      id:
        uuid("id")
          .defaultRandom()
          .primaryKey(),

      accountId:
        uuid("account_id")
          .notNull()
          .references(
            () => accounts.id,
            {
              onDelete:
                "cascade",
            },
          ),

      createdByUserId:
        uuid(
          "created_by_user_id",
        )
          .notNull()
          .references(
            () => users.id,
            {
              onDelete:
                "restrict",
            },
          ),

      name:
        text("name")
          .notNull(),

      provider:
        voiceProviderEnum(
          "provider",
        )
          .notNull(),

      config:
        jsonb("config")
          .$type<
            Record<
              string,
              string |
              number |
              boolean |
              null
            >
          >()
          .notNull()
          .default({}),

      credentialsEncrypted:
        text(
          "credentials_encrypted",
        ),

      isActive:
        boolean(
          "is_active",
        )
          .notNull()
          .default(true),

      /*
       * is_default agora significa apenas
       * canal preferencial.
       *
       * Nao significa canal exclusivo.
       */
      isDefault:
        boolean(
          "is_default",
        )
          .notNull()
          .default(false),

      allowInbound:
        boolean(
          "allow_inbound",
        )
          .notNull()
          .default(true),

      allowOutbound:
        boolean(
          "allow_outbound",
        )
          .notNull()
          .default(true),

      /*
       * Menor numero = maior prioridade.
       */
      priority:
        integer(
          "priority",
        )
          .notNull()
          .default(100),

      /*
       * Quantidade simultanea suportada
       * pela sessao/canal.
       *
       * Comeca conservadoramente em 1.
       * Podera ser elevado quando o
       * gateway comprovar maior capacidade.
       */
      maxConcurrentCalls:
        integer(
          "max_concurrent_calls",
        )
          .notNull()
          .default(1),

      healthStatus:
        voiceChannelHealthEnum(
          "health_status",
        )
          .notNull()
          .default("unknown"),

      lastHealthAt:
        timestamp(
          "last_health_at",
          {
            withTimezone: true,
          },
        ),

      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),

      updatedAt:
        timestamp(
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
        "voice_channels_account_name_uidx",
      ).on(
        table.accountId,
        table.name,
      ),

      /*
       * Pode existir somente um preferencial,
       * mas varios canais operacionais.
       */
      uniqueIndex(
        "voice_channels_account_default_uidx",
      )
        .on(
          table.accountId,
        )
        .where(
          sql`${table.isDefault} = true`,
        ),

      index(
        "voice_channels_account_idx",
      ).on(
        table.accountId,
      ),

      index(
        "voice_channels_provider_idx",
      ).on(
        table.accountId,
        table.provider,
      ),

      index(
        "voice_channels_routing_idx",
      ).on(
        table.accountId,
        table.isActive,
        table.allowOutbound,
        table.priority,
      ),

      check(
        "voice_channels_priority_check",
        sql`${table.priority} >= 0`,
      ),

      check(
        "voice_channels_max_concurrent_calls_check",
        sql`${table.maxConcurrentCalls} >= 1`,
      ),
    ],
  );

