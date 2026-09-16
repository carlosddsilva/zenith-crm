import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { googleCalendarConnections } from '@/lib/db/schema';
import { enqueueConnectionJob } from '@/lib/google-calendar/queue';
import { validatePushNotification } from '@/lib/google-calendar/protocol';

export async function POST(request: Request) {
  const channelId = request.headers.get('x-goog-channel-id');
  const resourceId = request.headers.get('x-goog-resource-id');
  const token = request.headers.get('x-goog-channel-token');
  const messageNumber = request.headers.get('x-goog-message-number');
  const resourceState = request.headers.get('x-goog-resource-state');
  if (!channelId || !resourceId || !token || !messageNumber || !resourceState) {
    return Response.json({ error: 'Invalid notification' }, { status: 400 });
  }
  if (!new Set(['sync', 'exists', 'not_exists']).has(resourceState)) {
    return Response.json({ error: 'Invalid resource state' }, { status: 400 });
  }

  const accepted = await db.transaction(async (tx) => {
    const [connection] = await tx
      .select()
      .from(googleCalendarConnections)
      .where(
        and(
          eq(googleCalendarConnections.watchChannelId, channelId),
          eq(googleCalendarConnections.watchResourceId, resourceId),
          eq(googleCalendarConnections.status, 'connected')
        )
      )
      .for('update')
      .limit(1);
    if (
      !connection ||
      !validatePushNotification(
        {
          channelId: connection.watchChannelId,
          resourceId: connection.watchResourceId,
          tokenHash: connection.watchTokenHash,
          expiresAt: connection.watchExpiresAt,
          lastMessageNumber: connection.watchLastMessageNumber,
        },
        { channelId, resourceId, token, messageNumber, resourceState }
      )
    ) {
      return false;
    }
    await tx
      .update(googleCalendarConnections)
      .set({ watchLastMessageNumber: messageNumber, updatedAt: new Date() })
      .where(eq(googleCalendarConnections.id, connection.id));
    await enqueueConnectionJob(tx, {
      accountId: connection.accountId,
      connectionId: connection.id,
      kind: 'pull',
      dedupeKey: `push:${connection.id}:${messageNumber}`,
    });
    return true;
  });
  return new Response(null, { status: accepted ? 204 : 404 });
}
