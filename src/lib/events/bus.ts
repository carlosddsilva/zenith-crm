import { AutomationTriggerType } from '@/types';
import { randomUUID } from 'crypto';

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

  // 1. You could log this to an 'event_logs' table here if needed for debugging
  // 2. Dispatch to the worker
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  
  // We use fetch without awaiting its final completion to let it run in the background (fire and forget)
  // or we can await it if we want to guarantee delivery to the queue/worker synchronously.
  // In a robust system, we would enqueue this into Redis or similar.
  // For now, we will fire the webhook to our own API route.
  
  try {
    fetch(`${appUrl}/api/zenith/workers/automation-dispatcher`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // In a real app we might pass a secret header here to authenticate internal worker calls
        'x-zenith-worker-token': process.env.ZENITH_WORKER_SECRET || 'dev-secret',
      },
      body: JSON.stringify(normalizedEvent),
    }).catch(err => {
      console.error('[EventBus] Failed to dispatch event to worker:', err);
    });
  } catch (err) {
    console.error('[EventBus] Error initiating fetch to worker:', err);
  }
}
