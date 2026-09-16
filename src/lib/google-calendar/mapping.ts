import type { GoogleCalendarEventSnapshot } from '@/lib/db/schema';

export interface GoogleEvent {
  id: string;
  etag?: string;
  status?: 'confirmed' | 'cancelled';
  summary?: string;
  description?: string;
  updated?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  recurringEventId?: string;
  recurrence?: string[];
  extendedProperties?: { private?: Record<string, string> };
}

export interface AppointmentLike {
  id: string;
  title: string;
  description: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  timezone: string;
  allDay: boolean;
  startTime: Date;
  endTime: Date;
  allDayStart: string | null;
  allDayEnd: string | null;
}

export function snapshotFromAppointment(
  value: AppointmentLike
): GoogleCalendarEventSnapshot {
  return {
    title: value.title,
    description: value.description,
    status: value.status,
    timezone: value.timezone,
    allDay: value.allDay,
    startTime: value.startTime.toISOString(),
    endTime: value.endTime.toISOString(),
    allDayStart: value.allDayStart,
    allDayEnd: value.allDayEnd,
  };
}

export function snapshotFromGoogleEvent(
  event: GoogleEvent,
  fallbackTimezone: string
): GoogleCalendarEventSnapshot {
  const allDay = Boolean(event.start?.date && event.end?.date);
  const start = allDay
    ? `${event.start!.date}T00:00:00.000Z`
    : event.start?.dateTime;
  const end = allDay ? `${event.end!.date}T00:00:00.000Z` : event.end?.dateTime;
  if (!start || !end) throw new Error('google_event_time_invalid');
  return {
    title: event.summary?.trim() || 'Compromisso sem título',
    description: event.description ?? null,
    status: event.status === 'cancelled' ? 'cancelled' : 'scheduled',
    timezone: event.start?.timeZone ?? event.end?.timeZone ?? fallbackTimezone,
    allDay,
    startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString(),
    allDayStart: allDay ? event.start!.date! : null,
    allDayEnd: allDay ? event.end!.date! : null,
    etag: event.etag ?? null,
    updated: event.updated ?? null,
    recurringEventId: event.recurringEventId ?? null,
    recurrence: event.recurrence ?? null,
  };
}

export function googleEventBody(
  appointment: AppointmentLike,
  accountId: string
) {
  return {
    summary: appointment.title,
    description: appointment.description ?? undefined,
    status: appointment.status === 'cancelled' ? 'cancelled' : 'confirmed',
    start: appointment.allDay
      ? { date: appointment.allDayStart }
      : {
          dateTime: appointment.startTime.toISOString(),
          timeZone: appointment.timezone,
        },
    end: appointment.allDay
      ? { date: appointment.allDayEnd }
      : {
          dateTime: appointment.endTime.toISOString(),
          timeZone: appointment.timezone,
        },
    extendedProperties: {
      private: {
        zenithAppointmentId: appointment.id,
        zenithAccountId: accountId,
      },
    },
  };
}

export function hasRemoteConflict(
  syncState: string,
  knownEtag: string | null,
  remoteEtag: string | undefined
) {
  return (
    syncState === 'pending' &&
    Boolean(knownEtag && remoteEtag && knownEtag !== remoteEtag)
  );
}

export function remoteSyncDecision(
  syncState: string,
  knownEtag: string | null,
  remoteEtag: string | undefined
): 'apply' | 'ignore_pending' | 'conflict' {
  if (hasRemoteConflict(syncState, knownEtag, remoteEtag)) return 'conflict';
  if (syncState === 'pending') return 'ignore_pending';
  return 'apply';
}
