import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  accounts,
} from "./identity";

import {
  messagingChannels,
  messagingProviderEnum,
} from "./messaging";

export const messagingWebhookStatusEnum =
  pgEnum(
    "messaging_webhook_status",
    [
      "received",
      "processed",
      "ignored",
      "failed",
    ],
  );

export const messagingWebhookEvents =
  pgTable(
    "messaging_webhook_events",
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

      messagingChannelId: uuid(
        "messaging_channel_id",
      )
        .notNull()
        .references(
          () => messagingChannels.id,
          {
            onDelete: "cascade",
          },
        ),

      provider:
        messagingProviderEnum(
          "provider",
        ).notNull(),

      eventKey:
        text("event_key")
          .notNull(),

      eventType:
        text("event_type"),

      payloadHash:
        text("payload_hash")
          .notNull(),

      status:
        messagingWebhookStatusEnum(
          "status",
        )
          .notNull()
          .default("received"),

      error:
        text("error"),

      receivedAt: timestamp(
        "received_at",
        {
          withTimezone: true,
        },
      )
        .notNull()
        .defaultNow(),

      processedAt: timestamp(
        "processed_at",
        {
          withTimezone: true,
        },
      ),
    },
    (table) => [
      uniqueIndex(
        "messaging_webhook_events_channel_event_uidx",
      ).on(
        table.messagingChannelId,
        table.eventKey,
      ),

      index(
        "messaging_webhook_events_account_idx",
      ).on(
        table.accountId,
      ),

      index(
        "messaging_webhook_events_channel_idx",
      ).on(
        table.messagingChannelId,
      ),

      index(
        "messaging_webhook_events_received_idx",
      ).on(
        table.receivedAt,
      ),
    ],
  );
