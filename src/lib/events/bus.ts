import { AutomationTriggerType } from '@/types';
import { randomUUID } from 'crypto';
import { redis } from '@/lib/redis';

export interface DispatchEventPayload {
  accountId: string;
  triggerType: AutomationTriggerType;
  /** Uniquely identifies this event occurrence for idempotency. Generate one if not provided. */
  eventId?: string;
  /** The type of entity that triggered the event (e.g. 'deal', 'contact') */
  entityType?: string;
  /** The ID of the entity that triggered the event */
  entityId?: string;
  /** Any relevant contextual data for the event (e.g. the new deal stage) */
  payload: Record<string, any>;
  /** Loop prevention: current depth of the automation chain */
  depth?: number;
}

const MAX_AUTOMATION_DEPTH = 3;

export async function publishEvent(event: DispatchEventPayload) {
  const depth = event.depth ?? 0;
  if (depth >= MAX_AUTOMATION_DEPTH) {
    console.warn(`[EventBus] Max automation depth reached (${depth}) for account ${event.accountId}, trigger ${event.triggerType}. Dropping event to prevent infinite loops.`);
    return;
  }

  const eventId = event.eventId || randomUUID();

  // Create the final normalized event
  const normalizedEvent = {
    ...event,
    eventId,
    depth,
  };

  // 1. Log to an event history table (optional)
  // 2. Dispatch to the durable Redis queue
  try {
    await redis.lpush('zenith:automation:events', JSON.stringify({ ...normalizedEvent, attempts: 0 }));
  } catch (err) {
    console.error('[EventBus] Error pushing to Redis queue, falling back to outbox:', err);
    
    // Fallback to database outbox if Redis is down
    const { db } = await import('@/lib/db/client');
    const { automationEventsOutbox } = await import('@/lib/db/schema');
    
    try {
      await db.insert(automationEventsOutbox).values({
        eventId: normalizedEvent.eventId,
        accountId: normalizedEvent.accountId,
        eventType: normalizedEvent.triggerType,
        payload: normalizedEvent,
        depth: normalizedEvent.depth,
        status: 'pending',
      });
      console.log(`[EventBus] Event ${normalizedEvent.eventId} saved to outbox successfully.`);
    } catch (dbErr) {
      console.error('[EventBus] CRITICAL: Failed to save event to outbox:', dbErr);
    }
  }
}
