import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  connection: null as null | Record<string, unknown>,
  tail: Promise.resolve() as Promise<void>,
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const previous = state.tail;
      let release!: () => void;
      state.tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              for: () => ({
                limit: async () => (state.connection ? [state.connection] : []),
              }),
            }),
          }),
        }),
        update: () => ({
          set: (values: Record<string, unknown>) => ({
            where: async () => {
              Object.assign(state.connection!, values);
            },
          }),
        }),
      };
      try {
        return await callback(tx);
      } finally {
        release();
      }
    }),
  },
}));

import { googleCalendarFetch } from './client';
import { encryptGoogleSecret } from './crypto';

describe('Google Calendar serialized token refresh', () => {
  beforeEach(() => {
    process.env.GOOGLE_CALENDAR_CLIENT_ID = 'client-test';
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'secret-test';
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = 'http://localhost/callback';
    state.tail = Promise.resolve();
    state.connection = {
      id: 'connection-1',
      accountId: 'account-1',
      status: 'connected',
      credentialsEncrypted: encryptGoogleSecret(
        JSON.stringify({
          accessToken: 'expired-access',
          refreshToken: 'refresh-token',
          tokenType: 'Bearer',
        })
      ),
      accessTokenExpiresAt: new Date(0),
    };
    vi.unstubAllGlobals();
  });

  it('performs one refresh for concurrent API requests', async () => {
    let refreshCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        if (String(url).includes('oauth2.googleapis.com/token')) {
          refreshCalls += 1;
          await new Promise((resolve) => setTimeout(resolve, 5));
          return new Response(
            JSON.stringify({
              access_token: 'fresh-access',
              expires_in: 3600,
              token_type: 'Bearer',
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      })
    );

    await Promise.all([
      googleCalendarFetch({
        accountId: 'account-1',
        connectionId: 'connection-1',
        path: '/calendars/a',
      }),
      googleCalendarFetch({
        accountId: 'account-1',
        connectionId: 'connection-1',
        path: '/calendars/a',
      }),
    ]);
    expect(refreshCalls).toBe(1);
  });

  it('marks revoked credentials unusable after invalid_grant', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'invalid_grant' }), {
            status: 400,
          })
      )
    );
    await expect(
      googleCalendarFetch({
        accountId: 'account-1',
        connectionId: 'connection-1',
        path: '/calendars/a',
      })
    ).rejects.toMatchObject({ code: 'oauth_revoked' });
    expect(state.connection?.status).toBe('revoked');
    expect(state.connection?.credentialsEncrypted).toBeNull();
  });
});
