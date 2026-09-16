import { AutomationTriggerType } from '@/types';
import { randomUUID } from 'crypto';
import { automationEventsOutbox } from '@/lib/db/schema';

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
  /** Trace correlation ID */
  correlationId?: string;
  /** The event that caused this one */
  causationId?: string;
}

const MAX_AUTOMATION_DEPTH = 3;

/**
 * Publishes an event to the transactional outbox.
 * MUST be called within a database transaction to guarantee atomic delivery.
 */
export async function publishEvent(tx: any, event: DispatchEventPayload) {
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

  try {
    await tx.insert(automationEventsOutbox).values({
      eventId: normalizedEvent.eventId,
      accountId: normalizedEvent.accountId,
      eventType: normalizedEvent.triggerType,
      aggregateType: normalizedEvent.entityType || null,
      aggregateId: normalizedEvent.entityId || null,
      correlationId: normalizedEvent.correlationId || null,
      causationId: normalizedEvent.causationId || null,
      payload: normalizedEvent,
      depth: normalizedEvent.depth,
      status: 'pending',
    });
  } catch (dbError) {
    console.error('[EventBus] CRITICAL: Failed to save event to outbox.', {
      accountId: normalizedEvent.accountId,
      eventId: normalizedEvent.eventId,
      errorCode: dbError instanceof Error ? dbError.name : 'unknown_error',
    });
    throw dbError; // Must throw to abort the transaction!
  }
}
