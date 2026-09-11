import Redis from 'ioredis';
import fetch from 'node-fetch'; // assuming node-fetch is available, or we use native fetch if Node 18+

const APP_BASE_URL = (process.env.VOICE_WORKER_APP_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const WORKER_SECRET = process.env.ZENITH_WORKER_SECRET || 'dev-secret';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

const QUEUE_NAME = 'zenith:automation:events';

console.log(`[automation-worker] Started consuming from ${QUEUE_NAME}`);

async function processEvent(eventJson) {
  try {
    const res = await fetch(`${APP_BASE_URL}/api/zenith/workers/automation-dispatcher`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-zenith-worker-token': WORKER_SECRET,
      },
      body: eventJson,
    });
    
    if (!res.ok) {
      console.error(`[automation-worker] Failed to dispatch event. HTTP ${res.status}`);
      const text = await res.text().catch(() => '');
      console.error(`[automation-worker] Response: ${text}`);
      // In a robust queue we might re-enqueue for retry depending on status.
      // But AT_LEAST_ONCE delivery is handled by the dispatcher idempotency if we retry.
      // For MVP, we log the error. The API dispatcher handles inner action failures.
    } else {
      console.log(`[automation-worker] Successfully dispatched event.`);
    }
  } catch (err) {
    console.error(`[automation-worker] Error making HTTP request:`, err);
  }
}

async function loop() {
  while (true) {
    try {
      // BLPOP blocks until an element is available. 0 means block indefinitely.
      const result = await redis.blpop(QUEUE_NAME, 0);
      if (result) {
        const [_, eventJson] = result;
        await processEvent(eventJson);
      }
    } catch (err) {
      console.error(`[automation-worker] Error in BLPOP loop:`, err);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

loop();
