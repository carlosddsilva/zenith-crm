import {
  sql,
} from "drizzle-orm";

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

import {
  contacts,
} from "./contacts";

import {
  voiceChannels,
  voiceProviderEnum,
} from "./voice";

export const callDirectionEnum =
  pgEnum(
    "call_direction",
    [
      "inbound",
      "outbound",
    ],
  );

export const callStateEnum =
  pgEnum(
    "call_state",
    [
      "new",
      "ringing",
      "connecting",
      "active",
      "ended",
      "failed",
      "rejected",
    ],
  );

export const callParticipantTypeEnum =
  pgEnum(
    "call_participant_type",
    [
      "contact",
      "user",
      "external",
      "system",
    ],
  );

export const calls =
  pgTable(
    "calls",
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

      voiceChannelId:
        uuid(
          "voice_channel_id",
        )
          .notNull()
          .references(
            () => voiceChannels.id,
            {
              onDelete:
                "restrict",
            },
          ),

      provider:
        voiceProviderEnum(
          "provider",
        )
          .notNull(),

      providerCallId:
        text(
          "provider_call_id",
        ),

      direction:
        callDirectionEnum(
          "direction",
        )
          .notNull(),

      state:
        callStateEnum(
          "state",
        )
          .notNull()
          .default("new"),

      contactId:
        uuid("contact_id")
          .references(
            () => contacts.id,
            {
              onDelete:
                "set null",
            },
          ),

      assignedAgentId:
        uuid(
          "assigned_agent_id",
        )
          .references(
            () => users.id,
            {
              onDelete:
                "set null",
            },
          ),

      createdByUserId:
        uuid(
          "created_by_user_id",
        )
          .references(
            () => users.id,
            {
              onDelete:
                "set null",
            },
          ),

      fromPhone:
        text(
          "from_phone",
        ),

      toPhone:
        text(
          "to_phone",
        ),

      failureReason:
        text(
          "failure_reason",
        ),

      endReason:
        text(
          "end_reason",
        ),

      startedAt:
        timestamp(
          "started_at",
          {
            withTimezone: true,
          },
        ),

      ringingAt:
        timestamp(
          "ringing_at",
          {
            withTimezone: true,
          },
        ),

      answeredAt:
        timestamp(
          "answered_at",
          {
            withTimezone: true,
          },
        ),

      endedAt:
        timestamp(
          "ended_at",
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
      index(
        "calls_account_idx",
      ).on(
        table.accountId,
      ),

      index(
        "calls_channel_idx",
      ).on(
        table.voiceChannelId,
      ),

      index(
        "calls_account_state_idx",
      ).on(
        table.accountId,
        table.state,
      ),

      index(
        "calls_contact_idx",
      ).on(
        table.contactId,
      ),

      index(
        "calls_agent_idx",
      ).on(
        table.assignedAgentId,
      ),

      index(
        "calls_created_idx",
      ).on(
        table.createdAt,
      ),

      uniqueIndex(
        "calls_channel_provider_call_uidx",
      )
        .on(
          table.voiceChannelId,
          table.providerCallId,
        )
        .where(
          sql`${table.providerCallId} IS NOT NULL`,
        ),
    ],
  );

export const callEvents =
  pgTable(
    "call_events",
    {
      id:
        uuid("id")
          .defaultRandom()
          .primaryKey(),

      callId:
        uuid("call_id")
          .notNull()
          .references(
            () => calls.id,
            {
              onDelete:
                "cascade",
            },
          ),

      eventType:
        text(
          "event_type",
        )
          .notNull(),

      state:
        callStateEnum(
          "state",
        ),

      providerEventId:
        text(
          "provider_event_id",
        ),

      payload:
        jsonb("payload")
          .$type<
            Record<
              string,
              unknown
            >
          >(),

      occurredAt:
        timestamp(
          "occurred_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),

      createdAt:
        timestamp(
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
        "call_events_call_idx",
      ).on(
        table.callId,
      ),

      index(
        "call_events_occurred_idx",
      ).on(
        table.occurredAt,
      ),

      uniqueIndex(
        "call_events_provider_event_uidx",
      )
        .on(
          table.callId,
          table.providerEventId,
        )
        .where(
          sql`${table.providerEventId} IS NOT NULL`,
        ),
    ],
  );

export const callParticipants =
  pgTable(
    "call_participants",
    {
      id:
        uuid("id")
          .defaultRandom()
          .primaryKey(),

      callId:
        uuid("call_id")
          .notNull()
          .references(
            () => calls.id,
            {
              onDelete:
                "cascade",
            },
          ),

      participantType:
        callParticipantTypeEnum(
          "participant_type",
        )
          .notNull(),

      contactId:
        uuid("contact_id")
          .references(
            () => contacts.id,
            {
              onDelete:
                "set null",
            },
          ),

      userId:
        uuid("user_id")
          .references(
            () => users.id,
            {
              onDelete:
                "set null",
            },
          ),

      providerParticipantId:
        text(
          "provider_participant_id",
        ),

      phone:
        text("phone"),

      displayName:
        text(
          "display_name",
        ),

      role:
        text("role"),

      isMuted:
        boolean(
          "is_muted",
        )
          .notNull()
          .default(false),

      isOnHold:
        boolean(
          "is_on_hold",
        )
          .notNull()
          .default(false),

      joinedAt:
        timestamp(
          "joined_at",
          {
            withTimezone: true,
          },
        ),

      leftAt:
        timestamp(
          "left_at",
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
      index(
        "call_participants_call_idx",
      ).on(
        table.callId,
      ),

      index(
        "call_participants_contact_idx",
      ).on(
        table.contactId,
      ),

      index(
        "call_participants_user_idx",
      ).on(
        table.userId,
      ),
    ],
  );
