import { timingSafeEqual } from 'node:crypto';

import { sha256Hex } from './crypto';

export interface PagedSyncPage<T> {
  items?: T[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export async function applyPagedSync<T>(input: {
  fetchPage: (pageToken?: string) => Promise<PagedSyncPage<T>>;
  applyPage: (items: T[]) => Promise<void>;
}) {
  let pageToken: string | undefined;
  let finalSyncToken: string | undefined;
  do {
    const page = await input.fetchPage(pageToken);
    await input.applyPage(page.items ?? []);
    pageToken = page.nextPageToken;
    finalSyncToken = page.nextSyncToken ?? finalSyncToken;
  } while (pageToken);
  if (!finalSyncToken) throw new Error('google_sync_token_missing');
  return finalSyncToken;
}

export interface PushChannelState {
  channelId: string | null;
  resourceId: string | null;
  tokenHash: string | null;
  expiresAt: Date | null;
  lastMessageNumber: string | null;
}

export function validatePushNotification(
  channel: PushChannelState,
  notification: {
    channelId: string;
    resourceId: string;
    token: string;
    messageNumber: string;
    resourceState: string;
  },
  now = new Date()
) {
  const suppliedTokenHash = sha256Hex(notification.token);
  const tokenMatches = Boolean(
    channel.tokenHash &&
    channel.tokenHash.length === suppliedTokenHash.length &&
    timingSafeEqual(
      Buffer.from(channel.tokenHash),
      Buffer.from(suppliedTokenHash)
    )
  );
  if (
    channel.channelId !== notification.channelId ||
    channel.resourceId !== notification.resourceId ||
    !tokenMatches ||
    !channel.expiresAt ||
    channel.expiresAt <= now ||
    !new Set(['sync', 'exists', 'not_exists']).has(
      notification.resourceState
    ) ||
    !/^\d+$/.test(notification.messageNumber)
  )
    return false;
  try {
    return (
      channel.lastMessageNumber === null ||
      BigInt(notification.messageNumber) > BigInt(channel.lastMessageNumber)
    );
  } catch {
    return false;
  }
}
