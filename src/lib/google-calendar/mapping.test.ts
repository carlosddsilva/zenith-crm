import { describe, expect, it } from 'vitest';

import {
  googleEventBody,
  hasRemoteConflict,
  remoteSyncDecision,
  snapshotFromGoogleEvent,
} from './mapping';

describe('Google Calendar event mapping', () => {
  it('preserves timezone for timed appointments', () => {
    const body = googleEventBody(
      {
        id: 'appointment-1',
        title: 'Demo',
        description: null,
        status: 'scheduled',
        timezone: 'America/Cuiaba',
        allDay: false,
        startTime: new Date('2030-02-10T12:00:00.000Z'),
        endTime: new Date('2030-02-10T13:00:00.000Z'),
        allDayStart: null,
        allDayEnd: null,
      },
      'account-1'
    );
    expect(body.start).toEqual({
      dateTime: '2030-02-10T12:00:00.000Z',
      timeZone: 'America/Cuiaba',
    });
    expect(body.extendedProperties.private.zenithAccountId).toBe('account-1');
  });

  it('preserves exclusive end dates for all-day events', () => {
    const snapshot = snapshotFromGoogleEvent(
      {
        id: 'event-1',
        summary: 'Holiday',
        start: { date: '2030-03-01' },
        end: { date: '2030-03-03' },
      },
      'America/Cuiaba'
    );
    expect(snapshot.allDay).toBe(true);
    expect(snapshot.allDayStart).toBe('2030-03-01');
    expect(snapshot.allDayEnd).toBe('2030-03-03');
  });

  it('detects an ETag conflict only while a local edit is pending', () => {
    expect(hasRemoteConflict('pending', '"v1"', '"v2"')).toBe(true);
    expect(hasRemoteConflict('synced', '"v1"', '"v2"')).toBe(false);
    expect(hasRemoteConflict('pending', '"v1"', '"v1"')).toBe(false);
  });

  it('preserves a pending local edit when Google still has the base ETag', () => {
    expect(remoteSyncDecision('pending', '"v1"', '"v1"')).toBe(
      'ignore_pending'
    );
    expect(remoteSyncDecision('pending', '"v1"', '"v2"')).toBe('conflict');
    expect(remoteSyncDecision('synced', '"v1"', '"v2"')).toBe('apply');
  });

  it('marks recurring instances so callers can keep them read-only', () => {
    const snapshot = snapshotFromGoogleEvent(
      {
        id: 'instance',
        recurringEventId: 'series',
        summary: 'Series',
        start: { dateTime: '2030-01-01T10:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2030-01-01T11:00:00Z', timeZone: 'UTC' },
      },
      'UTC'
    );
    expect(snapshot.recurringEventId).toBe('series');
  });
});
