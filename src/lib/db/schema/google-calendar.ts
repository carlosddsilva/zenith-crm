import {
  index,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { appointments } from './activities';
import { authSessions } from './auth';
import { accounts, users } from './identity';

export interface GoogleCalendarCredentials {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
}

export interface GoogleCalendarEventSnapshot {
  title: string;
  description: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  timezone: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  allDayStart: string | null;
  allDayEnd: string | null;
  etag?: string | null;
  updated?: string | null;
  recurringEventId?: string | null;
  recurrence?: string[] | null;
}

export const googleCalendarConnections = pgTable(
  'google_calendar_connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    credentialsEncrypted: text('credentials_encrypted'),
    scopes: text('scopes').notNull(),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),
    status: text('status').notNull().default('connected'),
    selectedCalendarId: text('selected_calendar_id'),
    selectedCalendarSummary: text('selected_calendar_summary'),
    selectedCalendarTimezone: text('selected_calendar_timezone'),
    syncToken: text('sync_token'),
    syncGeneration: integer('sync_generation').notNull().default(0),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    nextReconcileAt: timestamp('next_reconcile_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    refreshLeaseOwner: text('refresh_lease_owner'),
    refreshLeaseUntil: timestamp('refresh_lease_until', { withTimezone: true }),
    watchChannelId: text('watch_channel_id'),
    watchResourceId: text('watch_resource_id'),
    watchTokenHash: text('watch_token_hash'),
    watchExpiresAt: timestamp('watch_expires_at', { withTimezone: true }),
    watchLastMessageNumber: text('watch_last_message_number'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('google_calendar_connections_account_user_unique').on(
      table.accountId,
      table.userId
    ),
    index('google_calendar_connections_account_idx').on(table.accountId),
    uniqueIndex('google_calendar_connections_id_account_unique').on(
      table.id,
      table.accountId
    ),
    index('google_calendar_connections_reconcile_idx').on(
      table.status,
      table.nextReconcileAt
    ),
  ]
);

export const googleCalendarOauthStates = pgTable(
  'google_calendar_oauth_states',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    stateHash: text('state_hash').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => authSessions.id, { onDelete: 'cascade' }),
    codeVerifierEncrypted: text('code_verifier_encrypted').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('google_calendar_oauth_states_hash_unique').on(table.stateHash),
    index('google_calendar_oauth_states_expiry_idx').on(table.expiresAt),
  ]
);

export const googleCalendarEventLinks = pgTable(
  'google_calendar_event_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => googleCalendarConnections.id, { onDelete: 'cascade' }),
    appointmentId: uuid('appointment_id')
      .notNull()
      .references(() => appointments.id, { onDelete: 'cascade' }),
    googleCalendarId: text('google_calendar_id').notNull(),
    googleEventId: text('google_event_id').notNull(),
    googleEtag: text('google_etag'),
    googleUpdatedAt: timestamp('google_updated_at', { withTimezone: true }),
    syncState: text('sync_state').notNull().default('pending'),
    origin: text('origin').notNull().default('zenith'),
    baseSnapshot: jsonb('base_snapshot').$type<GoogleCalendarEventSnapshot>(),
    pendingLocalSnapshot: jsonb(
      'pending_local_snapshot'
    ).$type<GoogleCalendarEventSnapshot>(),
    conflictRemoteSnapshot: jsonb(
      'conflict_remote_snapshot'
    ).$type<GoogleCalendarEventSnapshot>(),
    readOnlyReason: text('read_only_reason'),
    lastErrorCode: text('last_error_code'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('google_calendar_event_links_appointment_unique').on(
      table.appointmentId
    ),
    uniqueIndex('google_calendar_event_links_external_unique').on(
      table.connectionId,
      table.googleCalendarId,
      table.googleEventId
    ),
    index('google_calendar_event_links_account_state_idx').on(
      table.accountId,
      table.syncState
    ),
    foreignKey({
      columns: [table.connectionId, table.accountId],
      foreignColumns: [
        googleCalendarConnections.id,
        googleCalendarConnections.accountId,
      ],
      name: 'google_calendar_event_links_connection_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.appointmentId, table.accountId],
      foreignColumns: [appointments.id, appointments.accountId],
      name: 'google_calendar_event_links_appointment_tenant_fk',
    }).onDelete('cascade'),
  ]
);

export const googleCalendarSyncJobs = pgTable(
  'google_calendar_sync_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => googleCalendarConnections.id, { onDelete: 'cascade' }),
    appointmentId: uuid('appointment_id').references(() => appointments.id, {
      onDelete: 'set null',
    }),
    kind: text('kind').notNull(),
    status: text('status').notNull().default('pending'),
    dedupeKey: text('dedupe_key').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('google_calendar_sync_jobs_dedupe_unique').on(table.dedupeKey),
    index('google_calendar_sync_jobs_poll_idx').on(
      table.status,
      table.nextAttemptAt,
      table.leaseExpiresAt
    ),
    index('google_calendar_sync_jobs_tenant_idx').on(
      table.accountId,
      table.connectionId
    ),
    foreignKey({
      columns: [table.connectionId, table.accountId],
      foreignColumns: [
        googleCalendarConnections.id,
        googleCalendarConnections.accountId,
      ],
      name: 'google_calendar_sync_jobs_connection_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.appointmentId, table.accountId],
      foreignColumns: [appointments.id, appointments.accountId],
      name: 'google_calendar_sync_jobs_appointment_tenant_fk',
    }),
  ]
);
