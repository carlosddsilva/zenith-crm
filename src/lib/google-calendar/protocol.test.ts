import { describe, expect, it, vi } from 'vitest';

import { sha256Hex } from './crypto';
import { applyPagedSync, validatePushNotification } from './protocol';

describe('Google Calendar incremental protocol', () => {
  it('applies every page and exposes only the final sync token', async () => {
    const applied: number[][] = [];
    const fetchPage = vi.fn(async (page?: string) =>
      page
        ? { items: [3], nextSyncToken: 'sync-final' }
        : { items: [1, 2], nextPageToken: 'page-2' }
    );
    const token = await applyPagedSync({
      fetchPage,
      applyPage: async (items) => {
        applied.push(items);
      },
    });
    expect(applied).toEqual([[1, 2], [3]]);
    expect(token).toBe('sync-final');
  });

  it('does not return a cursor when applying an intermediate page fails', async () => {
    await expect(
      applyPagedSync({
        fetchPage: async () => ({
          items: [1],
          nextSyncToken: 'must-not-commit',
        }),
        applyPage: async () => {
          throw new Error('database_down');
        },
      })
    ).rejects.toThrow('database_down');
  });

  it('propagates HTTP 410 so the durable sync layer can reset only its mirror', async () => {
    await expect(
      applyPagedSync({
        fetchPage: async () => {
          throw Object.assign(new Error('Gone'), { status: 410 });
        },
        applyPage: async () => undefined,
      })
    ).rejects.toMatchObject({ status: 410 });
  });
});

describe('Google Calendar push validation', () => {
  const now = new Date('2030-01-01T00:00:00Z');
  const channel = {
    channelId: 'channel-1',
    resourceId: 'resource-1',
    tokenHash: sha256Hex('secret-token'),
    expiresAt: new Date('2030-01-02T00:00:00Z'),
    lastMessageNumber: '10',
  };

  it('accepts a valid newer notification', () => {
    expect(
      validatePushNotification(
        channel,
        {
          channelId: 'channel-1',
          resourceId: 'resource-1',
          token: 'secret-token',
          messageNumber: '11',
          resourceState: 'exists',
        },
        now
      )
    ).toBe(true);
  });

  it('rejects invalid token, resource, expired channel and out-of-order messages', () => {
    const base = {
      channelId: 'channel-1',
      resourceId: 'resource-1',
      token: 'secret-token',
      messageNumber: '11',
      resourceState: 'exists',
    };
    expect(
      validatePushNotification(channel, { ...base, token: 'wrong' }, now)
    ).toBe(false);
    expect(
      validatePushNotification(channel, { ...base, resourceId: 'wrong' }, now)
    ).toBe(false);
    expect(
      validatePushNotification(channel, { ...base, messageNumber: '9' }, now)
    ).toBe(false);
    expect(
      validatePushNotification(channel, base, new Date('2030-01-03T00:00:00Z'))
    ).toBe(false);
  });
});
