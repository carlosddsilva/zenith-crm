import { createServer } from "node:http";

const appUrl = process.env.ZENITH_APP_URL ?? "http://127.0.0.1:3000";
const workerSecret = process.env.ZENITH_WORKER_SECRET;
const healthPort = Number.parseInt(process.env.WORKER_HEALTH_PORT ?? "3004", 10);
if (!workerSecret) throw new Error("ZENITH_WORKER_SECRET is required");

let ready = false;
let stopping = false;
const health = createServer((request, response) => {
  if (request.url === "/live") return void response.writeHead(200).end("ok");
  if (request.url === "/ready") return void response.writeHead(ready ? 200 : 503).end(ready ? "ready" : "starting");
  response.writeHead(404).end();
});
health.listen(healthPort, "0.0.0.0");

async function loop() {
  while (!stopping) {
    try {
      const response = await fetch(`${appUrl}/api/zenith/workers/ai/process`, {
        method: "POST",
        headers: { "x-zenith-worker-token": workerSecret },
      });
      if (!response.ok) throw new Error(`worker_http_${response.status}`);
      ready = true;
    } catch (error) {
      ready = false;
      console.error("[ai-worker] cycle failed", { errorCode: error instanceof Error ? error.message : "unknown_error" });
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    stopping = true;
    ready = false;
    health.close(() => process.exit(0));
  });
}
void loop();

