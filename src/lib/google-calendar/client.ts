import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import {
  googleCalendarConnections,
  type GoogleCalendarCredentials,
} from '@/lib/db/schema';
import { getGoogleCalendarConfig } from './config';
import { decryptGoogleSecret, encryptGoogleSecret } from './crypto';

export class GoogleCalendarApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds: number | null = null
  ) {
    super(code);
    this.name = 'GoogleCalendarApiError';
  }

  get retryable() {
    return (
      this.status === 429 ||
      this.status >= 500 ||
      (this.status === 403 && this.code === 'rateLimitExceeded')
    );
  }
}

function credentials(value: string | null): GoogleCalendarCredentials {
  if (!value)
    throw new GoogleCalendarApiError(401, 'google_connection_disconnected');
  return JSON.parse(decryptGoogleSecret(value)) as GoogleCalendarCredentials;
}

async function refreshAccessToken(
  connectionId: string,
  accountId: string,
  force = false
) {
  return db.transaction(async (tx) => {
    const [connection] = await tx
      .select()
      .from(googleCalendarConnections)
      .where(
        and(
          eq(googleCalendarConnections.id, connectionId),
          eq(googleCalendarConnections.accountId, accountId)
        )
      )
      .for('update')
      .limit(1);
    if (!connection || connection.status !== 'connected') {
      throw new GoogleCalendarApiError(401, 'google_connection_disconnected');
    }
    const current = credentials(connection.credentialsEncrypted);
    if (
      !force &&
      connection.accessTokenExpiresAt &&
      connection.accessTokenExpiresAt.getTime() > Date.now() + 60_000
    ) {
      return current.accessToken;
    }

    const config = getGoogleCalendarConfig();
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: current.refreshToken,
        grant_type: 'refresh_token',
      }),
      cache: 'no-store',
    });
    const body = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      token_type?: string;
      error?: string;
    };
    if (!response.ok || !body.access_token) {
      const revoked = body.error === 'invalid_grant';
      await tx
        .update(googleCalendarConnections)
        .set({
          status: revoked ? 'revoked' : 'error',
          credentialsEncrypted: revoked
            ? null
            : connection.credentialsEncrypted,
          lastErrorCode: revoked ? 'oauth_revoked' : 'oauth_refresh_failed',
          updatedAt: new Date(),
        })
        .where(eq(googleCalendarConnections.id, connection.id));
      throw new GoogleCalendarApiError(
        response.status || 401,
        revoked ? 'oauth_revoked' : 'oauth_refresh_failed'
      );
    }
    const next: GoogleCalendarCredentials = {
      ...current,
      accessToken: body.access_token,
      tokenType: body.token_type ?? current.tokenType,
    };
    await tx
      .update(googleCalendarConnections)
      .set({
        credentialsEncrypted: encryptGoogleSecret(JSON.stringify(next)),
        accessTokenExpiresAt: new Date(
          Date.now() + (body.expires_in ?? 3600) * 1000
        ),
        status: 'connected',
        lastErrorCode: null,
        updatedAt: new Date(),
      })
      .where(eq(googleCalendarConnections.id, connection.id));
    return next.accessToken;
  });
}

function errorCode(body: unknown) {
  if (!body || typeof body !== 'object') return 'google_api_error';
  const value = body as {
    error?: { errors?: Array<{ reason?: string }>; status?: string };
  };
  return (
    value.error?.errors?.[0]?.reason ??
    value.error?.status ??
    'google_api_error'
  );
}

export async function googleCalendarFetch<T>(input: {
  accountId: string;
  connectionId: string;
  path: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}) {
  let token = await refreshAccessToken(input.connectionId, input.accountId);
  for (let authAttempt = 0; authAttempt < 2; authAttempt += 1) {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3${input.path}`,
      {
        method: input.method ?? 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          ...(input.body === undefined
            ? {}
            : { 'content-type': 'application/json' }),
          ...input.headers,
        },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        cache: 'no-store',
      }
    );
    if (response.status === 401 && authAttempt === 0) {
      token = await refreshAccessToken(
        input.connectionId,
        input.accountId,
        true
      );
      continue;
    }
    const raw = await response.text();
    const body = raw ? JSON.parse(raw) : null;
    if (!response.ok) {
      const retryAfter = Number.parseInt(
        response.headers.get('retry-after') ?? '',
        10
      );
      throw new GoogleCalendarApiError(
        response.status,
        errorCode(body),
        Number.isFinite(retryAfter) ? retryAfter : null
      );
    }
    return body as T;
  }
  throw new GoogleCalendarApiError(401, 'google_auth_failed');
}

export async function revokeGoogleCredentials(encrypted: string) {
  const value = credentials(encrypted);
  const response = await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: value.refreshToken }),
    cache: 'no-store',
  });
  if (!response.ok && response.status !== 400) {
    throw new GoogleCalendarApiError(response.status, 'google_revoke_failed');
  }
}
