import { randomBytes } from 'node:crypto';

import { and, eq, isNull } from 'drizzle-orm';

import { getCurrentUser } from '@/lib/auth/current-user';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { db } from '@/lib/db/client';
import {
  googleCalendarConnections,
  googleCalendarOauthStates,
  type GoogleCalendarCredentials,
} from '@/lib/db/schema';
import { getGoogleCalendarConfig, GOOGLE_CALENDAR_SCOPES } from './config';
import {
  decryptGoogleSecret,
  encryptGoogleSecret,
  sha256Base64Url,
  sha256Hex,
} from './crypto';
import { enqueueConnectionJob } from './queue';

const OAUTH_STATE_TTL_MS = 10 * 60_000;

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
}

export function oauthStateMatches(
  row: {
    accountId: string;
    userId: string;
    sessionId: string;
    expiresAt: Date;
    consumedAt: Date | null;
  },
  expected: { accountId: string; userId: string; sessionId: string },
  now = new Date()
) {
  return (
    row.accountId === expected.accountId &&
    row.userId === expected.userId &&
    row.sessionId === expected.sessionId &&
    row.expiresAt > now &&
    row.consumedAt === null
  );
}

export async function createGoogleAuthorizationUrl() {
  const context = await requireZenithRole('agent');
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.userId !== context.userId)
    throw new Error('Unauthorized');

  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  await db.insert(googleCalendarOauthStates).values({
    stateHash: sha256Hex(state),
    accountId: context.accountId,
    userId: context.userId,
    sessionId: currentUser.sessionId,
    codeVerifierEncrypted: encryptGoogleSecret(verifier),
    expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
  });

  const config = getGoogleCalendarConfig();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: GOOGLE_CALENDAR_SCOPES.join(' '),
    state,
    code_challenge: sha256Base64Url(verifier),
    code_challenge_method: 'S256',
  }).toString();
  return url;
}

async function exchangeCode(code: string, verifier: string) {
  const config = getGoogleCalendarConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
    cache: 'no-store',
  });
  const body = (await response.json()) as TokenResponse;
  if (!response.ok || body.error || !body.access_token || !body.refresh_token) {
    throw new Error(
      body.error === 'invalid_grant'
        ? 'google_oauth_invalid_grant'
        : 'google_oauth_exchange_failed'
    );
  }
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_in: body.expires_in,
    scope: body.scope,
    token_type: body.token_type,
  };
}

export async function consumeGoogleOauthCallback(state: string, code: string) {
  const context = await requireZenithRole('agent');
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.userId !== context.userId)
    throw new Error('Unauthorized');

  const oauthState = await db.transaction(async (tx) => {
    const [candidate] = await tx
      .select()
      .from(googleCalendarOauthStates)
      .where(eq(googleCalendarOauthStates.stateHash, sha256Hex(state)))
      .for('update')
      .limit(1);
    if (
      !candidate ||
      !oauthStateMatches(candidate, {
        accountId: context.accountId,
        userId: context.userId,
        sessionId: currentUser.sessionId,
      })
    )
      return null;
    const [consumed] = await tx
      .update(googleCalendarOauthStates)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(googleCalendarOauthStates.id, candidate.id),
          isNull(googleCalendarOauthStates.consumedAt)
        )
      )
      .returning();
    return consumed ?? null;
  });
  if (!oauthState) throw new Error('google_oauth_state_invalid_or_replayed');

  const tokens = await exchangeCode(
    code,
    decryptGoogleSecret(oauthState.codeVerifierEncrypted)
  );
  const credentials: GoogleCalendarCredentials = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenType: tokens.token_type ?? 'Bearer',
  };
  const [connection] = await db
    .insert(googleCalendarConnections)
    .values({
      accountId: context.accountId,
      userId: context.userId,
      credentialsEncrypted: encryptGoogleSecret(JSON.stringify(credentials)),
      scopes: tokens.scope ?? GOOGLE_CALENDAR_SCOPES.join(' '),
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      status: 'connected',
      lastErrorCode: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        googleCalendarConnections.accountId,
        googleCalendarConnections.userId,
      ],
      set: {
        credentialsEncrypted: encryptGoogleSecret(JSON.stringify(credentials)),
        scopes: tokens.scope ?? GOOGLE_CALENDAR_SCOPES.join(' '),
        accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        status: 'connected',
        lastErrorCode: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (connection.selectedCalendarId) {
    await db.transaction(async (tx) => {
      await enqueueConnectionJob(tx, {
        accountId: connection.accountId,
        connectionId: connection.id,
        kind: 'pull',
        dedupeKey: `oauth-reconnect:${connection.id}:${Date.now()}`,
      });
      await enqueueConnectionJob(tx, {
        accountId: connection.accountId,
        connectionId: connection.id,
        kind: 'renew_watch',
        dedupeKey: `oauth-reconnect-watch:${connection.id}:${Date.now()}`,
      });
    });
  }
  return connection;
}
