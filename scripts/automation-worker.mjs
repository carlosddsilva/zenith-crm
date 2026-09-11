import Redis from 'ioredis';
import fetch from 'node-fetch'; // assuming node-fetch is available, or we use native fetch if Node 18+

const APP_BASE_URL = (process.env.VOICE_WORKER_APP_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const WORKER_SECRET = process.env.ZENITH_WORKER_SECRET || 'dev-secret';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

const QUEUE_NAME = 'zenith:automation:events';
const PROCESSING_QUEUE = 'zenith:automation:events:processing';
const DEAD_QUEUE = 'zenith:automation:events:dead';

console.log(`[automation-worker] Starting worker...`);

async function performStartupSweep() {
  console.log(`[automation-worker] Performing startup sweep of processing queue...`);
  let sweptCount = 0;
  while (true) {
    const item = await redis.rpoplpush(PROCESSING_QUEUE, QUEUE_NAME);
    if (!item) break;
    sweptCount++;
  }
  console.log(`[automation-worker] Swept ${sweptCount} items back to main queue.`);
}

async function processEvent(eventJsonStr) {
  let eventPayload;
  try {
    eventPayload = JSON.parse(eventJsonStr);
  } catch (err) {
    console.error(`[automation-worker] Failed to parse event JSON. Moving to dead queue.`);
    await redis.lpush(DEAD_QUEUE, eventJsonStr);
    await redis.lrem(PROCESSING_QUEUE, 1, eventJsonStr);
    return;
  }

  try {
    const res = await fetch(`${APP_BASE_URL}/api/zenith/workers/automation-dispatcher`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-zenith-worker-token': WORKER_SECRET,
      },
      body: eventJsonStr,
    });
    
    if (res.ok) {
      console.log(`[automation-worker] Successfully dispatched event. ACKing.`);
      await redis.lrem(PROCESSING_QUEUE, 1, eventJsonStr);
    } else {
      console.error(`[automation-worker] Failed to dispatch event. HTTP ${res.status}`);
      const text = await res.text().catch(() => '');
      console.error(`[automation-worker] Response: ${text}`);
      await handleFailure(eventPayload, eventJsonStr);
    }
  } catch (err) {
    console.error(`[automation-worker] Error making HTTP request:`, err);
    await handleFailure(eventPayload, eventJsonStr);
  }
}

async function handleFailure(eventPayload, eventJsonStr) {
  // Remove from processing
  await redis.lrem(PROCESSING_QUEUE, 1, eventJsonStr);
  
  const attempts = (eventPayload.attempts || 0) + 1;
  const newPayload = { ...eventPayload, attempts };
  
  if (attempts < 3) {
    console.log(`[automation-worker] Retrying event (Attempt ${attempts}/3). Re-queueing...`);
    await redis.lpush(QUEUE_NAME, JSON.stringify(newPayload));
  } else {
    console.error(`[automation-worker] Event exceeded max retries. Moving to DLQ.`);
    await redis.lpush(DEAD_QUEUE, JSON.stringify(newPayload));
  }
}

async function sweepOutboxLoop() {
  setInterval(async () => {
    try {
      const res = await fetch(`${APP_BASE_URL}/api/zenith/workers/automation-outbox-sweep`, {
        method: 'POST',
        headers: {
          'x-zenith-worker-token': WORKER_SECRET,
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.pushedCount > 0) {
          console.log(`[automation-worker] Outbox Sweep: Recovered ${data.pushedCount} events.`);
        }
      }
    } catch (e) {
      // ignore silent failures for outbox sweep
    }
  }, 30000);
}

async function loop() {
  while (true) {
    try {
      // BRPOPLPUSH atomically moves from main to processing and returns it
      const eventJson = await redis.brpoplpush(QUEUE_NAME, PROCESSING_QUEUE, 0);
      if (eventJson) {
        await processEvent(eventJson);
      }
    } catch (err) {
      console.error(`[automation-worker] Error in BRPOPLPUSH loop:`, err);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

async function main() {
  await performStartupSweep();
  sweepOutboxLoop();
  loop();
}

main().catch(console.error);
