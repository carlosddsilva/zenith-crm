import { and, count, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { apiErrorResponse } from '@/lib/api/error-response';
import { logAuditAction } from '@/lib/audit/logger';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { db } from '@/lib/db/client';
import {
  googleCalendarConnections,
  googleCalendarEventLinks,
  googleCalendarSyncJobs,
} from '@/lib/db/schema';
import {
  googleCalendarFetch,
  revokeGoogleCredentials,
} from '@/lib/google-calendar/client';
import { enqueueConnectionJob } from '@/lib/google-calendar/queue';

const selectCalendarSchema = z.object({
  calendarId: z.string().min(1).max(1024),
});

export async function GET() {
  try {
    const context = await requireZenithRole('agent');
    const [connection] = await db
      .select({
        id: googleCalendarConnections.id,
        status: googleCalendarConnections.status,
        calendarId: googleCalendarConnections.selectedCalendarId,
        calendarSummary: googleCalendarConnections.selectedCalendarSummary,
        calendarTimezone: googleCalendarConnections.selectedCalendarTimezone,
        lastSyncedAt: googleCalendarConnections.lastSyncedAt,
        watchExpiresAt: googleCalendarConnections.watchExpiresAt,
        lastErrorCode: googleCalendarConnections.lastErrorCode,
      })
      .from(googleCalendarConnections)
      .where(
        and(
          eq(googleCalendarConnections.accountId, context.accountId),
          eq(googleCalendarConnections.userId, context.userId)
        )
      )
      .limit(1);
    if (!connection) return Response.json({ connection: null, conflicts: [] });
    const conflicts = await db
      .select({
        id: googleCalendarEventLinks.id,
        appointmentId: googleCalendarEventLinks.appointmentId,
        local: googleCalendarEventLinks.pendingLocalSnapshot,
        remote: googleCalendarEventLinks.conflictRemoteSnapshot,
      })
      .from(googleCalendarEventLinks)
      .where(
        and(
          eq(googleCalendarEventLinks.accountId, context.accountId),
          eq(googleCalendarEventLinks.connectionId, connection.id),
          eq(googleCalendarEventLinks.syncState, 'conflict')
        )
      );
    return Response.json({ connection, conflicts });
  } catch (error) {
    return apiErrorResponse(error, '[GET google-calendar]');
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireZenithRole('agent');
    const parsed = selectCalendarSchema.safeParse(await request.json());
    if (!parsed.success)
      return Response.json({ error: 'Calendário inválido.' }, { status: 400 });
    const [connection] = await db
      .select()
      .from(googleCalendarConnections)
      .where(
        and(
          eq(googleCalendarConnections.accountId, context.accountId),
          eq(googleCalendarConnections.userId, context.userId),
          eq(googleCalendarConnections.status, 'connected')
        )
      )
      .limit(1);
    if (!connection)
      return Response.json(
        { error: 'Google Calendar não conectado.' },
        { status: 404 }
      );

    if (
      connection.selectedCalendarId &&
      connection.selectedCalendarId !== parsed.data.calendarId
    ) {
      const [linked] = await db
        .select({ value: count() })
        .from(googleCalendarEventLinks)
        .where(
          and(
            eq(googleCalendarEventLinks.accountId, context.accountId),
            eq(googleCalendarEventLinks.connectionId, connection.id)
          )
        );
      if (Number(linked.value) > 0) {
        return Response.json(
          {
            error:
              'Desconecte a integração antes de trocar um calendário que já possui vínculos.',
          },
          { status: 409 }
        );
      }
    }
    const calendar = await googleCalendarFetch<{
      id: string;
      summary: string;
      timeZone?: string;
      accessRole: string;
      deleted?: boolean;
    }>({
      accountId: context.accountId,
      connectionId: connection.id,
      path: `/users/me/calendarList/${encodeURIComponent(parsed.data.calendarId)}`,
    });
    if (
      calendar.deleted ||
      !['writer', 'owner'].includes(calendar.accessRole)
    ) {
      return Response.json(
        { error: 'O calendário selecionado não permite escrita.' },
        { status: 400 }
      );
    }
    await db.transaction(async (tx) => {
      await tx
        .update(googleCalendarConnections)
        .set({
          selectedCalendarId: calendar.id,
          selectedCalendarSummary: calendar.summary,
          selectedCalendarTimezone: calendar.timeZone ?? 'UTC',
          syncToken: null,
          lastSyncedAt: null,
          nextReconcileAt: new Date(),
          lastErrorCode: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(googleCalendarConnections.id, connection.id),
            eq(googleCalendarConnections.accountId, context.accountId)
          )
        );
      await enqueueConnectionJob(tx, {
        accountId: context.accountId,
        connectionId: connection.id,
        kind: 'pull',
        dedupeKey: `initial:${connection.id}:${calendar.id}`,
      });
      await enqueueConnectionJob(tx, {
        accountId: context.accountId,
        connectionId: connection.id,
        kind: 'renew_watch',
        dedupeKey: `initial-watch:${connection.id}:${calendar.id}`,
      });
    });
    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, '[PATCH google-calendar]');
  }
}

export async function POST() {
  try {
    const context = await requireZenithRole('agent');
    const [connection] = await db
      .select({
        id: googleCalendarConnections.id,
        calendarId: googleCalendarConnections.selectedCalendarId,
      })
      .from(googleCalendarConnections)
      .where(
        and(
          eq(googleCalendarConnections.accountId, context.accountId),
          eq(googleCalendarConnections.userId, context.userId),
          eq(googleCalendarConnections.status, 'connected')
        )
      )
      .limit(1);
    if (!connection?.calendarId)
      return Response.json(
        { error: 'Selecione um calendário.' },
        { status: 409 }
      );
    await db.transaction((tx) =>
      enqueueConnectionJob(tx, {
        accountId: context.accountId,
        connectionId: connection.id,
        kind: 'reconcile',
        dedupeKey: `manual:${connection.id}:${Math.floor(Date.now() / 10_000)}`,
      })
    );
    return Response.json({ ok: true }, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error, '[POST google-calendar]');
  }
}

export async function DELETE() {
  try {
    const context = await requireZenithRole('agent');
    const [connection] = await db
      .select()
      .from(googleCalendarConnections)
      .where(
        and(
          eq(googleCalendarConnections.accountId, context.accountId),
          eq(googleCalendarConnections.userId, context.userId)
        )
      )
      .limit(1);
    if (!connection) return new Response(null, { status: 204 });

    let remoteCleanup = 'completed';
    try {
      if (
        connection.watchChannelId &&
        connection.watchResourceId &&
        connection.credentialsEncrypted
      ) {
        await googleCalendarFetch<null>({
          accountId: context.accountId,
          connectionId: connection.id,
          path: '/channels/stop',
          method: 'POST',
          body: {
            id: connection.watchChannelId,
            resourceId: connection.watchResourceId,
          },
        });
      }
      if (connection.credentialsEncrypted)
        await revokeGoogleCredentials(connection.credentialsEncrypted);
    } catch {
      remoteCleanup = 'best_effort_failed';
    }

    await db.transaction(async (tx) => {
      await tx
        .update(googleCalendarConnections)
        .set({
          credentialsEncrypted: null,
          accessTokenExpiresAt: null,
          status: 'disconnected',
          syncToken: null,
          watchChannelId: null,
          watchResourceId: null,
          watchTokenHash: null,
          watchExpiresAt: null,
          lastErrorCode:
            remoteCleanup === 'completed' ? null : 'remote_cleanup_failed',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(googleCalendarConnections.id, connection.id),
            eq(googleCalendarConnections.accountId, context.accountId)
          )
        );
      await tx
        .update(googleCalendarEventLinks)
        .set({ syncState: 'disconnected', updatedAt: new Date() })
        .where(
          and(
            eq(googleCalendarEventLinks.connectionId, connection.id),
            eq(googleCalendarEventLinks.accountId, context.accountId)
          )
        );
      await tx
        .update(googleCalendarSyncJobs)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(
          and(
            eq(googleCalendarSyncJobs.connectionId, connection.id),
            eq(googleCalendarSyncJobs.accountId, context.accountId),
            inArray(googleCalendarSyncJobs.status, ['pending', 'processing'])
          )
        );
    });
    await logAuditAction({
      context,
      action: 'DISCONNECT_INTEGRATION',
      entityType: 'google_calendar_connection',
      entityId: connection.id,
      metadata: {
        provider: 'google_calendar',
        remoteCleanup,
        remoteEventsPreserved: true,
      },
    });
    return Response.json({
      ok: true,
      remoteCleanup,
      remoteEventsPreserved: true,
    });
  } catch (error) {
    return apiErrorResponse(error, '[DELETE google-calendar]');
  }
}
