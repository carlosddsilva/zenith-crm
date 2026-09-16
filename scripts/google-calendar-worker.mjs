import { createServer } from 'node:http';

const appUrl = process.env.ZENITH_APP_URL ?? 'http://127.0.0.1:3000';
const workerSecret = process.env.ZENITH_WORKER_SECRET;
const healthPort = Number.parseInt(
  process.env.WORKER_HEALTH_PORT ?? '3003',
  10
);
if (!workerSecret) throw new Error('ZENITH_WORKER_SECRET is required');

let ready = false;
let stopping = false;

async function post(path) {
  const response = await fetch(`${appUrl}${path}`, {
    method: 'POST',
    headers: { 'x-zenith-worker-token': workerSecret },
  });
  if (!response.ok) throw new Error(`worker_http_${response.status}`);
}

const health = createServer((request, response) => {
  if (request.url === '/live') {
    response.writeHead(200).end('ok');
    return;
  }
  if (request.url === '/ready') {
    response.writeHead(ready ? 200 : 503).end(ready ? 'ready' : 'starting');
    return;
  }
  response.writeHead(404).end();
});
health.listen(healthPort, '0.0.0.0');

async function loop() {
  let nextSchedule = 0;
  while (!stopping) {
    try {
      if (Date.now() >= nextSchedule) {
        await post('/api/zenith/workers/google-calendar/schedule');
        nextSchedule = Date.now() + 60_000;
      }
      await post('/api/zenith/workers/google-calendar/process');
      ready = true;
    } catch (error) {
      ready = false;
      console.error('[google-calendar-worker] cycle failed', {
        errorCode: error instanceof Error ? error.message : 'unknown_error',
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    stopping = true;
    ready = false;
    health.close(() => process.exit(0));
  });
}

void loop();
