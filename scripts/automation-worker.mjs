import http from 'node:http';

const APP_BASE_URL = (process.env.ZENITH_APP_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const WORKER_SECRET = process.env.ZENITH_WORKER_SECRET;
const HEALTH_PORT = Number(process.env.WORKER_HEALTH_PORT || '3002');

if (!WORKER_SECRET) {
  throw new Error('ZENITH_WORKER_SECRET is required');
}

console.log(`[automation-worker] Starting outbox polling worker...`);

let stopping = false;
let lastHealthyAt = Date.now();

const healthServer = http.createServer((request, response) => {
  const live = request.url === '/live';
  const ready = request.url === '/ready' && Date.now() - lastHealthyAt < 60_000;
  response.statusCode = live || ready ? 200 : 503;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ status: live || ready ? 'ok' : 'unavailable' }));
});

healthServer.listen(HEALTH_PORT, '0.0.0.0');

async function processEvent(event) {
  let success = false;
  let errorMsg = null;
  try {
    const res = await fetch(`${APP_BASE_URL}/api/zenith/workers/automation-dispatcher`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-zenith-worker-token': WORKER_SECRET,
      },
      body: JSON.stringify({
        accountId: event.accountId,
        triggerType: event.eventType,
        eventId: event.eventId,
        entityType: event.aggregateType,
        entityId: event.aggregateId,
        // The event payload column actually contains the entire normalized event object now.
        payload: event.payload?.payload || event.payload,
        depth: event.depth,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    
    if (res.ok) {
      console.log(`[automation-worker] Successfully dispatched event ${event.eventId}.`);
      success = true;
    } else {
      const data = await res.json().catch(() => ({}));
      errorMsg = data.error || `HTTP ${res.status}`;
      console.error(`[automation-worker] Failed to dispatch event ${event.eventId}: ${errorMsg}`);
    }
  } catch (error) {
    errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[automation-worker] Dispatcher request failed.`, {
      errorCode: error instanceof Error ? error.name : 'unknown_error',
    });
  }

  // ACK/NACK back to outbox-ack
  try {
    await fetch(`${APP_BASE_URL}/api/zenith/workers/automation-outbox-ack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-zenith-worker-token': WORKER_SECRET,
      },
      body: JSON.stringify({
        id: event.id,
        success,
        error: errorMsg,
      }),
    });
  } catch (ackError) {
    console.error(`[automation-worker] Failed to ACK event ${event.eventId}. It will be retried later when lease expires.`);
  }
}

async function loop() {
  while (!stopping) {
    try {
      const res = await fetch(`${APP_BASE_URL}/api/zenith/workers/automation-outbox-claim`, {
        method: 'POST',
        headers: {
          'x-zenith-worker-token': WORKER_SECRET,
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        throw new Error(`Claim API responded with HTTP ${res.status}`);
      }

      const data = await res.json();
      lastHealthyAt = Date.now();

      if (data.events && data.events.length > 0) {
        console.log(`[automation-worker] Claimed ${data.events.length} events.`);
        for (const event of data.events) {
          if (stopping) break;
          await processEvent(event);
        }
      } else {
        // No events, wait before polling again
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (error) {
      if (stopping) break;
      console.error(`[automation-worker] Claim error:`, error.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

async function main() {
  await loop();
}

main().catch((error) => {
  console.error("[automation-worker] fatal", {
    errorCode: error instanceof Error ? error.name : "unknown_error",
  });
  process.exitCode = 1;
});

function shutdown() {
  stopping = true;
  healthServer.close();
  setTimeout(() => process.exit(0), 5_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
