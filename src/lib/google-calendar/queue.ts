import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import {
  googleCalendarConnections,
  googleCalendarEventLinks,
  googleCalendarSyncJobs,
} from '@/lib/db/schema';
import { snapshotFromAppointment, type AppointmentLike } from './mapping';

type Database = typeof import('@/lib/db/client').db;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export async function enqueueAppointmentSync(
  tx: Transaction,
  input: {
    accountId: string;
    userId: string;
    appointment: AppointmentLike & { updatedAt: Date };
    operation: 'upsert' | 'cancel';
  }
) {
  const [connection] = await tx
    .select()
    .from(googleCalendarConnections)
    .where(
      and(
        eq(googleCalendarConnections.accountId, input.accountId),
        eq(googleCalendarConnections.userId, input.userId),
        eq(googleCalendarConnections.status, 'connected')
      )
    )
    .limit(1);
  if (!connection?.selectedCalendarId) return null;

  const snapshot = snapshotFromAppointment(input.appointment);
  await tx
    .update(googleCalendarEventLinks)
    .set({
      syncState: 'pending',
      origin: 'zenith',
      pendingLocalSnapshot: snapshot,
      lastErrorCode: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(googleCalendarEventLinks.accountId, input.accountId),
        eq(googleCalendarEventLinks.connectionId, connection.id),
        eq(googleCalendarEventLinks.appointmentId, input.appointment.id)
      )
    );

  const [job] = await tx
    .insert(googleCalendarSyncJobs)
    .values({
      accountId: input.accountId,
      connectionId: connection.id,
      appointmentId: input.appointment.id,
      kind: input.operation === 'cancel' ? 'push_cancel' : 'push_upsert',
      dedupeKey: `local:${input.appointment.id}:${input.appointment.updatedAt.toISOString()}:${input.operation}`,
      payload: { operation: input.operation },
    })
    .onConflictDoNothing({ target: googleCalendarSyncJobs.dedupeKey })
    .returning();
  return job ?? null;
}

export async function enqueueConnectionJob(
  tx: Transaction,
  input: {
    accountId: string;
    connectionId: string;
    kind: 'pull' | 'reconcile' | 'renew_watch';
    dedupeKey?: string;
  }
) {
  const bucket = Math.floor(Date.now() / 60_000);
  const [job] = await tx
    .insert(googleCalendarSyncJobs)
    .values({
      accountId: input.accountId,
      connectionId: input.connectionId,
      kind: input.kind,
      dedupeKey:
        input.dedupeKey ??
        `${input.kind}:${input.connectionId}:${bucket}:${randomUUID()}`,
    })
    .onConflictDoNothing({ target: googleCalendarSyncJobs.dedupeKey })
    .returning();
  return job ?? null;
}
