import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { and, eq, isNotNull, lte, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import {
  appointments,
  googleCalendarConnections,
  googleCalendarEventLinks,
  googleCalendarSyncJobs,
} from '@/lib/db/schema';
import { getGoogleCalendarConfig } from './config';
import { googleCalendarFetch, GoogleCalendarApiError } from './client';
import { sha256Hex } from './crypto';
import {
  googleEventBody,
  remoteSyncDecision,
  snapshotFromAppointment,
  snapshotFromGoogleEvent,
  type GoogleEvent,
} from './mapping';
import { enqueueConnectionJob } from './queue';
import { applyPagedSync } from './protocol';

interface GoogleEventsPage {
  items?: GoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

interface WatchResponse {
  id: string;
  resourceId: string;
  expiration?: string;
}

function calendarPath(calendarId: string) {
  return `/calendars/${encodeURIComponent(calendarId)}`;
}

function googleEventId(accountId: string, appointmentId: string) {
  return createHash('sha256')
    .update(`${accountId}:${appointmentId}`)
    .digest('hex')
    .slice(0, 32);
}

async function loadSyncTarget(
  accountId: string,
  connectionId: string,
  appointmentId: string
) {
  const [row] = await db
    .select({
      connection: googleCalendarConnections,
      appointment: appointments,
      link: googleCalendarEventLinks,
    })
    .from(googleCalendarConnections)
    .innerJoin(
      appointments,
      and(
        eq(appointments.id, appointmentId),
        eq(appointments.accountId, googleCalendarConnections.accountId),
        eq(appointments.organizerUserId, googleCalendarConnections.userId)
      )
    )
    .leftJoin(
      googleCalendarEventLinks,
      and(
        eq(googleCalendarEventLinks.appointmentId, appointments.id),
        eq(googleCalendarEventLinks.connectionId, googleCalendarConnections.id),
        eq(
          googleCalendarEventLinks.accountId,
          googleCalendarConnections.accountId
        )
      )
    )
    .where(
      and(
        eq(googleCalendarConnections.id, connectionId),
        eq(googleCalendarConnections.accountId, accountId),
        eq(googleCalendarConnections.status, 'connected')
      )
    )
    .limit(1);
  if (!row?.connection.selectedCalendarId)
    throw new Error('google_calendar_not_selected');
  return row;
}

async function markConflict(
  linkId: string,
  remote: GoogleEvent,
  fallbackTimezone: string
) {
  await db
    .update(googleCalendarEventLinks)
    .set({
      syncState: 'conflict',
      conflictRemoteSnapshot: snapshotFromGoogleEvent(remote, fallbackTimezone),
      lastErrorCode: 'etag_conflict',
      updatedAt: new Date(),
    })
    .where(eq(googleCalendarEventLinks.id, linkId));
}

async function fetchRemoteEvent(input: {
  accountId: string;
  connectionId: string;
  calendarId: string;
  eventId: string;
}) {
  return googleCalendarFetch<GoogleEvent>({
    accountId: input.accountId,
    connectionId: input.connectionId,
    path: `${calendarPath(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
  });
}

export async function pushAppointmentToGoogle(input: {
  accountId: string;
  connectionId: string;
  appointmentId: string;
  cancel: boolean;
}) {
  const target = await loadSyncTarget(
    input.accountId,
    input.connectionId,
    input.appointmentId
  );
  const { appointment, connection, link } = target;
  const calendarId = connection.selectedCalendarId!;
  if (link?.readOnlyReason) throw new Error('google_event_read_only');

  if ((input.cancel || appointment.status === 'cancelled') && !link) return;
  if ((input.cancel || appointment.status === 'cancelled') && link) {
    try {
      await googleCalendarFetch<null>({
        accountId: input.accountId,
        connectionId: input.connectionId,
        path: `${calendarPath(calendarId)}/events/${encodeURIComponent(link.googleEventId)}?sendUpdates=none`,
        method: 'DELETE',
        headers: link.googleEtag ? { 'if-match': link.googleEtag } : undefined,
      });
    } catch (error) {
      if (!(error instanceof GoogleCalendarApiError) || error.status !== 404) {
        if (error instanceof GoogleCalendarApiError && error.status === 412) {
          const remote = await fetchRemoteEvent({
            ...input,
            calendarId,
            eventId: link.googleEventId,
          });
          await markConflict(
            link.id,
            remote,
            connection.selectedCalendarTimezone ?? appointment.timezone
          );
          return;
        }
        throw error;
      }
    }
    await db
      .update(googleCalendarEventLinks)
      .set({
        syncState: 'synced',
        origin: 'zenith',
        pendingLocalSnapshot: null,
        conflictRemoteSnapshot: null,
        googleEtag: null,
        lastErrorCode: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(googleCalendarEventLinks.id, link.id),
          eq(googleCalendarEventLinks.accountId, input.accountId)
        )
      );
    return;
  }

  const body = googleEventBody(appointment, input.accountId);
  let remote: GoogleEvent;
  if (!link) {
    const eventId = googleEventId(input.accountId, appointment.id);
    try {
      remote = await googleCalendarFetch<GoogleEvent>({
        accountId: input.accountId,
        connectionId: input.connectionId,
        path: `${calendarPath(calendarId)}/events?sendUpdates=none`,
        method: 'POST',
        body: { ...body, id: eventId },
      });
    } catch (error) {
      if (!(error instanceof GoogleCalendarApiError) || error.status !== 409)
        throw error;
      remote = await fetchRemoteEvent({ ...input, calendarId, eventId });
    }
  } else {
    try {
      remote = await googleCalendarFetch<GoogleEvent>({
        accountId: input.accountId,
        connectionId: input.connectionId,
        path: `${calendarPath(calendarId)}/events/${encodeURIComponent(link.googleEventId)}?sendUpdates=none`,
        method: 'PATCH',
        body,
        headers: link.googleEtag ? { 'if-match': link.googleEtag } : undefined,
      });
    } catch (error) {
      if (error instanceof GoogleCalendarApiError && error.status === 412) {
        remote = await fetchRemoteEvent({
          ...input,
          calendarId,
          eventId: link.googleEventId,
        });
        await markConflict(
          link.id,
          remote,
          connection.selectedCalendarTimezone ?? appointment.timezone
        );
        return;
      }
      throw error;
    }
  }

  const snapshot = snapshotFromAppointment(appointment);
  await db
    .insert(googleCalendarEventLinks)
    .values({
      accountId: input.accountId,
      connectionId: input.connectionId,
      appointmentId: appointment.id,
      googleCalendarId: calendarId,
      googleEventId: remote.id,
      googleEtag: remote.etag ?? null,
      googleUpdatedAt: remote.updated ? new Date(remote.updated) : null,
      syncState: 'synced',
      origin: 'zenith',
      baseSnapshot: snapshot,
    })
    .onConflictDoUpdate({
      target: googleCalendarEventLinks.appointmentId,
      set: {
        googleCalendarId: calendarId,
        googleEventId: remote.id,
        googleEtag: remote.etag ?? null,
        googleUpdatedAt: remote.updated ? new Date(remote.updated) : null,
        syncState: 'synced',
        origin: 'zenith',
        baseSnapshot: snapshot,
        pendingLocalSnapshot: null,
        conflictRemoteSnapshot: null,
        lastErrorCode: null,
        updatedAt: new Date(),
      },
    });
}

async function applyRemotePage(
  connection: typeof googleCalendarConnections.$inferSelect,
  events: GoogleEvent[]
) {
  await db.transaction(async (tx) => {
    for (const event of events) {
      if (!event.id) continue;
      const privateValues = event.extendedProperties?.private;
      const linkedAppointmentId = privateValues?.zenithAppointmentId;
      if (
        privateValues?.zenithAccountId &&
        privateValues.zenithAccountId !== connection.accountId
      )
        continue;

      let [link] = await tx
        .select()
        .from(googleCalendarEventLinks)
        .where(
          and(
            eq(googleCalendarEventLinks.accountId, connection.accountId),
            eq(googleCalendarEventLinks.connectionId, connection.id),
            eq(
              googleCalendarEventLinks.googleCalendarId,
              connection.selectedCalendarId!
            ),
            eq(googleCalendarEventLinks.googleEventId, event.id)
          )
        )
        .limit(1);
      if (!link && linkedAppointmentId) {
        [link] = await tx
          .select()
          .from(googleCalendarEventLinks)
          .where(
            and(
              eq(googleCalendarEventLinks.accountId, connection.accountId),
              eq(googleCalendarEventLinks.connectionId, connection.id),
              eq(googleCalendarEventLinks.appointmentId, linkedAppointmentId)
            )
          )
          .limit(1);
      }
      if (!link) continue;

      const remote = snapshotFromGoogleEvent(
        event,
        connection.selectedCalendarTimezone ?? 'UTC'
      );
      if (event.recurringEventId || event.recurrence?.length) {
        await tx
          .update(googleCalendarEventLinks)
          .set({
            syncState: 'error',
            readOnlyReason: 'recurring_event_not_editable',
            conflictRemoteSnapshot: remote,
            lastErrorCode: 'recurring_event_not_editable',
            updatedAt: new Date(),
          })
          .where(eq(googleCalendarEventLinks.id, link.id));
        continue;
      }
      const remoteDecision = remoteSyncDecision(
        link.syncState,
        link.googleEtag,
        event.etag
      );
      if (remoteDecision === 'conflict') {
        await tx
          .update(googleCalendarEventLinks)
          .set({
            syncState: 'conflict',
            conflictRemoteSnapshot: remote,
            lastErrorCode: 'concurrent_update',
            updatedAt: new Date(),
          })
          .where(eq(googleCalendarEventLinks.id, link.id));
        continue;
      }
      if (remoteDecision === 'ignore_pending') {
        // Google still has the base version; preserve the newer local edit until
        // its durable outbound job succeeds.
        continue;
      }

      await tx
        .update(appointments)
        .set({
          title: remote.title,
          description: remote.description,
          status: remote.status,
          timezone: remote.timezone,
          allDay: remote.allDay,
          startTime: new Date(remote.startTime),
          endTime: new Date(remote.endTime),
          allDayStart: remote.allDayStart,
          allDayEnd: remote.allDayEnd,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(appointments.id, link.appointmentId),
            eq(appointments.accountId, connection.accountId)
          )
        );
      await tx
        .update(googleCalendarEventLinks)
        .set({
          googleEtag: event.etag ?? null,
          googleUpdatedAt: event.updated ? new Date(event.updated) : null,
          syncState: 'synced',
          origin: 'google',
          baseSnapshot: remote,
          pendingLocalSnapshot: null,
          conflictRemoteSnapshot: null,
          lastErrorCode: null,
          updatedAt: new Date(),
        })
        .where(eq(googleCalendarEventLinks.id, link.id));
    }
  });
}

export async function pullGoogleChanges(
  accountId: string,
  connectionId: string,
  allowReset = true
) {
  const [connection] = await db
    .select()
    .from(googleCalendarConnections)
    .where(
      and(
        eq(googleCalendarConnections.id, connectionId),
        eq(googleCalendarConnections.accountId, accountId),
        eq(googleCalendarConnections.status, 'connected')
      )
    )
    .limit(1);
  if (!connection?.selectedCalendarId)
    throw new Error('google_calendar_not_selected');
  const selectedCalendarId = connection.selectedCalendarId;

  try {
    const nextSyncToken = await applyPagedSync<GoogleEvent>({
      fetchPage: async (pageToken) => {
        const params = new URLSearchParams({
          maxResults: '2500',
          showDeleted: 'true',
          singleEvents: 'false',
        });
        if (connection.syncToken) params.set('syncToken', connection.syncToken);
        if (pageToken) params.set('pageToken', pageToken);
        return googleCalendarFetch<GoogleEventsPage>({
          accountId,
          connectionId,
          path: `${calendarPath(selectedCalendarId)}/events?${params}`,
        });
      },
      applyPage: (items) => applyRemotePage(connection, items),
    });
    await db
      .update(googleCalendarConnections)
      .set({
        syncToken: nextSyncToken,
        lastSyncedAt: new Date(),
        nextReconcileAt: new Date(Date.now() + 15 * 60_000),
        lastErrorCode: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(googleCalendarConnections.id, connectionId),
          eq(googleCalendarConnections.accountId, accountId)
        )
      );
  } catch (error) {
    if (
      allowReset &&
      error instanceof GoogleCalendarApiError &&
      error.status === 410
    ) {
      await db
        .update(googleCalendarConnections)
        .set({
          syncToken: null,
          syncGeneration: sql`${googleCalendarConnections.syncGeneration} + 1`,
          lastErrorCode: 'sync_token_gone',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(googleCalendarConnections.id, connectionId),
            eq(googleCalendarConnections.accountId, accountId)
          )
        );
      return pullGoogleChanges(accountId, connectionId, false);
    }
    throw error;
  }
}

export async function renewGoogleWatch(
  accountId: string,
  connectionId: string
) {
  const [connection] = await db
    .select()
    .from(googleCalendarConnections)
    .where(
      and(
        eq(googleCalendarConnections.id, connectionId),
        eq(googleCalendarConnections.accountId, accountId)
      )
    )
    .limit(1);
  const pushUrl = getGoogleCalendarConfig().pushUrl;
  if (
    !connection?.selectedCalendarId ||
    !pushUrl ||
    connection.status !== 'connected'
  ) {
    throw new Error('google_watch_unavailable');
  }
  const previous =
    connection.watchChannelId && connection.watchResourceId
      ? {
          id: connection.watchChannelId,
          resourceId: connection.watchResourceId,
        }
      : null;
  const channelId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const requestedExpiration = Date.now() + 6 * 24 * 60 * 60_000;
  const watch = await googleCalendarFetch<WatchResponse>({
    accountId,
    connectionId,
    path: `${calendarPath(connection.selectedCalendarId)}/events/watch`,
    method: 'POST',
    body: {
      id: channelId,
      type: 'web_hook',
      address: pushUrl,
      token,
      expiration: String(requestedExpiration),
    },
  });
  await db
    .update(googleCalendarConnections)
    .set({
      watchChannelId: watch.id,
      watchResourceId: watch.resourceId,
      watchTokenHash: sha256Hex(token),
      watchExpiresAt: new Date(Number(watch.expiration ?? requestedExpiration)),
      watchLastMessageNumber: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(googleCalendarConnections.id, connectionId),
        eq(googleCalendarConnections.accountId, accountId)
      )
    );

  if (previous) {
    try {
      await googleCalendarFetch<null>({
        accountId,
        connectionId,
        path: '/channels/stop',
        method: 'POST',
        body: previous,
      });
    } catch {
      // The new channel is already durable; the old one expires by itself.
    }
  }
}

function retryDelay(attempt: number, retryAfterSeconds: number | null) {
  const exponential = Math.min(2 ** Math.max(attempt - 1, 0), 64);
  return (
    Math.max(retryAfterSeconds ?? 0, exponential) * 1000 +
    Math.floor(Math.random() * 1000)
  );
}

export async function processNextGoogleCalendarJob() {
  const job = await db.transaction(async (tx) => {
    const [candidate] = await tx
      .select()
      .from(googleCalendarSyncJobs)
      .where(
        and(
          or(
            eq(googleCalendarSyncJobs.status, 'pending'),
            and(
              eq(googleCalendarSyncJobs.status, 'processing'),
              lte(googleCalendarSyncJobs.leaseExpiresAt, new Date())
            )
          ),
          lte(googleCalendarSyncJobs.nextAttemptAt, new Date())
        )
      )
      .orderBy(googleCalendarSyncJobs.createdAt)
      .for('update', { skipLocked: true })
      .limit(1);
    if (!candidate) return null;
    const [claimed] = await tx
      .update(googleCalendarSyncJobs)
      .set({
        status: 'processing',
        attempts: candidate.attempts + 1,
        lockedAt: new Date(),
        leaseExpiresAt: new Date(Date.now() + 2 * 60_000),
        updatedAt: new Date(),
      })
      .where(eq(googleCalendarSyncJobs.id, candidate.id))
      .returning();
    return claimed;
  });
  if (!job) return false;

  try {
    if (job.kind === 'push_upsert' || job.kind === 'push_cancel') {
      if (!job.appointmentId) throw new Error('google_job_appointment_missing');
      await pushAppointmentToGoogle({
        accountId: job.accountId,
        connectionId: job.connectionId,
        appointmentId: job.appointmentId,
        cancel: job.kind === 'push_cancel',
      });
    } else if (job.kind === 'pull' || job.kind === 'reconcile') {
      await pullGoogleChanges(job.accountId, job.connectionId);
    } else if (job.kind === 'renew_watch') {
      await renewGoogleWatch(job.accountId, job.connectionId);
    } else {
      throw new Error('google_job_kind_invalid');
    }
    await db
      .update(googleCalendarSyncJobs)
      .set({
        status: 'completed',
        completedAt: new Date(),
        lockedAt: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
        updatedAt: new Date(),
      })
      .where(eq(googleCalendarSyncJobs.id, job.id));
  } catch (error) {
    const code = error instanceof Error ? error.message : 'google_job_failed';
    const retryable =
      !(error instanceof GoogleCalendarApiError) || error.retryable;
    const dead = !retryable || job.attempts >= 8;
    const retryAfter =
      error instanceof GoogleCalendarApiError ? error.retryAfterSeconds : null;
    await db
      .update(googleCalendarSyncJobs)
      .set({
        status: dead ? 'dead' : 'pending',
        nextAttemptAt: new Date(
          Date.now() + retryDelay(job.attempts, retryAfter)
        ),
        lockedAt: null,
        leaseExpiresAt: null,
        lastErrorCode: code.slice(0, 100),
        updatedAt: new Date(),
      })
      .where(eq(googleCalendarSyncJobs.id, job.id));
  }
  return true;
}

export async function scheduleGoogleCalendarMaintenance() {
  const now = new Date();
  const renewBefore = new Date(Date.now() + 24 * 60 * 60_000);
  const connections = await db
    .select()
    .from(googleCalendarConnections)
    .where(
      and(
        eq(googleCalendarConnections.status, 'connected'),
        isNotNull(googleCalendarConnections.selectedCalendarId)
      )
    );
  let scheduled = 0;
  await db.transaction(async (tx) => {
    for (const connection of connections) {
      if (!connection.nextReconcileAt || connection.nextReconcileAt <= now) {
        const job = await enqueueConnectionJob(tx, {
          accountId: connection.accountId,
          connectionId: connection.id,
          kind: 'reconcile',
          dedupeKey: `reconcile:${connection.id}:${Math.floor(Date.now() / 900_000)}`,
        });
        if (job) scheduled += 1;
      }
      if (
        !connection.watchExpiresAt ||
        connection.watchExpiresAt <= renewBefore
      ) {
        const job = await enqueueConnectionJob(tx, {
          accountId: connection.accountId,
          connectionId: connection.id,
          kind: 'renew_watch',
          dedupeKey: `renew:${connection.id}:${Math.floor(Date.now() / 3_600_000)}`,
        });
        if (job) scheduled += 1;
      }
    }
  });
  return scheduled;
}

export async function applyConflictResolution(input: {
  accountId: string;
  userId: string;
  connectionId: string;
  linkId: string;
  resolution: 'zenith' | 'google';
}) {
  const [row] = await db
    .select({ link: googleCalendarEventLinks, appointment: appointments })
    .from(googleCalendarEventLinks)
    .innerJoin(
      appointments,
      and(
        eq(appointments.id, googleCalendarEventLinks.appointmentId),
        eq(appointments.accountId, input.accountId)
      )
    )
    .innerJoin(
      googleCalendarConnections,
      and(
        eq(googleCalendarConnections.id, googleCalendarEventLinks.connectionId),
        eq(googleCalendarConnections.accountId, input.accountId),
        eq(googleCalendarConnections.userId, input.userId)
      )
    )
    .where(
      and(
        eq(googleCalendarEventLinks.id, input.linkId),
        eq(googleCalendarEventLinks.connectionId, input.connectionId),
        eq(googleCalendarEventLinks.accountId, input.accountId),
        eq(googleCalendarEventLinks.syncState, 'conflict')
      )
    )
    .limit(1);
  if (!row?.link.conflictRemoteSnapshot) return false;

  if (input.resolution === 'google') {
    const remote = row.link.conflictRemoteSnapshot;
    await db.transaction(async (tx) => {
      await tx
        .update(appointments)
        .set({
          title: remote.title,
          description: remote.description,
          status: remote.status,
          timezone: remote.timezone,
          allDay: remote.allDay,
          startTime: new Date(remote.startTime),
          endTime: new Date(remote.endTime),
          allDayStart: remote.allDayStart,
          allDayEnd: remote.allDayEnd,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(appointments.id, row.appointment.id),
            eq(appointments.accountId, input.accountId)
          )
        );
      await tx
        .update(googleCalendarEventLinks)
        .set({
          googleEtag: remote.etag ?? row.link.googleEtag,
          googleUpdatedAt: remote.updated
            ? new Date(remote.updated)
            : row.link.googleUpdatedAt,
          syncState: 'synced',
          origin: 'google',
          baseSnapshot: remote,
          pendingLocalSnapshot: null,
          conflictRemoteSnapshot: null,
          lastErrorCode: null,
          updatedAt: new Date(),
        })
        .where(eq(googleCalendarEventLinks.id, row.link.id));
    });
  } else {
    const remote = row.link.conflictRemoteSnapshot;
    await db.transaction(async (tx) => {
      await tx
        .update(googleCalendarEventLinks)
        .set({
          googleEtag: remote.etag ?? row.link.googleEtag,
          syncState: 'pending',
          conflictRemoteSnapshot: null,
          lastErrorCode: null,
          updatedAt: new Date(),
        })
        .where(eq(googleCalendarEventLinks.id, row.link.id));
      await tx.insert(googleCalendarSyncJobs).values({
        accountId: input.accountId,
        connectionId: input.connectionId,
        appointmentId: row.appointment.id,
        kind: 'push_upsert',
        dedupeKey: `resolve:${row.link.id}:${randomUUID()}`,
        payload: { resolution: 'zenith' },
      });
    });
  }
  return true;
}
