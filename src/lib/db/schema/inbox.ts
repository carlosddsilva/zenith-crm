import { sql } from "drizzle-orm";

import {
  AnyPgColumn,
  boolean,
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

import { accounts, users } from "./identity";
import { contacts } from "./contacts";
import {
  messagingChannels,
  messagingProviderEnum,
} from "./messaging";

export const conversationStatusEnum =
  pgEnum(
    "conversation_status",
    [
      "open",
      "pending",
      "closed",
    ],
  );

export const conversationSlaStatusEnum =
  pgEnum(
    "conversation_sla_status",
    [
      "ok",
      "warning",
      "overdue",
    ],
  );

export const messageSenderTypeEnum =
  pgEnum(
    "message_sender_type",
    [
      "customer",
      "agent",
      "bot",
    ],
  );

export const messageContentTypeEnum =
  pgEnum(
    "message_content_type",
    [
      "text",
      "image",
      "document",
      "audio",
      "video",
      "location",
      "template",
      "interactive",
    ],
  );

export const messageStatusEnum =
  pgEnum(
    "message_status",
    [
      "sending",
      "sent",
      "delivered",
      "read",
      "failed",
    ],
  );

export const conversations =
  pgTable(
    "conversations",
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

      contactId: uuid("contact_id")
        .notNull()
        .references(() => contacts.id, {
          onDelete: "cascade",
        }),

      status:
        conversationStatusEnum("status")
          .notNull()
          .default("open"),

      assignedAgentId:
        uuid("assigned_agent_id")
          .references(() => users.id, {
            onDelete: "set null",
          }),

      lastMessageText:
        text("last_message_text"),

      lastMessageAt: timestamp(
        "last_message_at",
        {
          withTimezone: true,
        },
      ),

      unreadCount: integer(
        "unread_count",
      )
        .notNull()
        .default(0),

      aiAutoreplyDisabled: boolean(
        "ai_autoreply_disabled",
      )
        .notNull()
        .default(false),

      aiReplyCount: integer(
        "ai_reply_count",
      )
        .notNull()
        .default(0),

      aiHandoffSummary:
        text("ai_handoff_summary"),

      firstUnrepliedMessageAt: timestamp(
        "first_unreplied_message_at",
        {
          withTimezone: true,
        },
      ),

      slaStatus: conversationSlaStatusEnum("sla_status")
        .notNull()
        .default("ok"),

      slaPolicyId: uuid("sla_policy_id"),

      lastSlaBreachAt: timestamp(
        "last_sla_breach_at",
        {
          withTimezone: true,
        },
      ),

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
        "conversations_account_contact_uidx",
      ).on(
        table.accountId,
        table.contactId,
      ),

      index(
        "conversations_account_idx",
      ).on(table.accountId),

      index(
        "conversations_account_status_idx",
      ).on(
        table.accountId,
        table.status,
      ),

      index(
        "conversations_contact_idx",
      ).on(table.contactId),

      index(
        "conversations_last_message_idx",
      ).on(
        table.accountId,
        table.lastMessageAt,
      ),
    ],
  );

export const messages =
  pgTable(
    "messages",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),

      conversationId:
        uuid("conversation_id")
          .notNull()
          .references(
            () => conversations.id,
            {
              onDelete: "cascade",
            },
          ),

      senderType:
        messageSenderTypeEnum(
          "sender_type",
        ).notNull(),

      senderId: uuid("sender_id")
        .references(() => users.id, {
          onDelete: "set null",
        }),

      contentType:
        messageContentTypeEnum(
          "content_type",
        )
          .notNull()
          .default("text"),

      contentText:
        text("content_text"),

      mediaUrl:
        text("media_url"),

      mediaType:
        text("media_type"),

      templateName:
        text("template_name"),

      messageId:
        text("message_id"),

      provider:
        messagingProviderEnum(
          "provider",
        ),

      messagingChannelId:
        uuid(
          "messaging_channel_id",
        ).references(
          () =>
            messagingChannels.id,
          {
            onDelete: "set null",
          },
        ),

      transportError:
        text(
          "transport_error",
        ),

      status:
        messageStatusEnum("status")
          .notNull()
          .default("sent"),

      replyToMessageId: uuid(
        "reply_to_message_id",
      ).references(
        (): AnyPgColumn =>
          messages.id,
        {
          onDelete: "set null",
        },
      ),

      interactiveReplyId:
        text(
          "interactive_reply_id",
        ),

      interactivePayload:
        jsonb(
          "interactive_payload",
        ).$type<
          Record<
            string,
            unknown
          > | null
        >(),

      aiGenerated: boolean(
        "ai_generated",
      )
        .notNull()
        .default(false),

      aiRunId: uuid("ai_run_id"),

      createdAt: timestamp(
        "created_at",
        {
          withTimezone: true,
        },
      )
        .notNull()
        .defaultNow(),
    },
    (table) => [
      index(
        "messages_conversation_idx",
      ).on(
        table.conversationId,
      ),

      index(
        "messages_conversation_created_idx",
      ).on(
        table.conversationId,
        table.createdAt,
      ),

      index(
        "messages_message_id_idx",
      ).on(
        table.messageId,
      ),

      uniqueIndex(
        "messages_channel_message_uidx",
      )
        .on(
          table.messagingChannelId,
          table.messageId,
        )
        .where(
          sql`${table.messageId} IS NOT NULL AND ${table.messagingChannelId} IS NOT NULL`,
        ),

      index(
        "messages_channel_idx",
      ).on(
        table.messagingChannelId,
      ),

      index(
        "messages_reply_to_idx",
      ).on(
        table.replyToMessageId,
      ),

      uniqueIndex(
        "messages_ai_run_uidx",
      )
        .on(table.aiRunId)
        .where(sql`${table.aiRunId} IS NOT NULL`),
    ],
  );



