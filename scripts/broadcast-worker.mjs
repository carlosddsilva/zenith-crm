import http from "node:http";

const appBaseUrl = (process.env.ZENITH_APP_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const workerSecret = process.env.ZENITH_WORKER_SECRET;
const healthPort = Number(process.env.WORKER_HEALTH_PORT || "3002");

if (!workerSecret) {
  throw new Error("ZENITH_WORKER_SECRET is required");
}

let lastSuccessAt = 0;
let stopping = false;

const healthServer = http.createServer((request, response) => {
  const live = request.url === "/live";
  const ready = request.url === "/ready" && Date.now() - lastSuccessAt < 60_000;
  response.statusCode = live || ready ? 200 : 503;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify({ status: live || ready ? "ok" : "unavailable" }));
});

healthServer.listen(healthPort, "0.0.0.0");

async function dispatchBatch() {
  const response = await fetch(`${appBaseUrl}/api/zenith/workers/broadcast-dispatcher`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-zenith-worker-token": workerSecret,
    },
    body: "{}",
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`dispatcher_http_${response.status}`);
  }

  lastSuccessAt = Date.now();
  return response.json();
}

async function main() {
  let failureDelay = 2_000;
  while (!stopping) {
    try {
      const result = await dispatchBatch();
      failureDelay = 2_000;
      await new Promise((resolve) => setTimeout(resolve, result.processed ? 250 : 2_000));
    } catch (error) {
      console.error("[broadcast-worker] dispatch unavailable", {
        errorCode: error instanceof Error ? error.message : "unknown_error",
      });
      await new Promise((resolve) => setTimeout(resolve, failureDelay));
      failureDelay = Math.min(failureDelay * 2, 30_000);
    }
  }
}

function shutdown() {
  stopping = true;
  healthServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

main().catch((error) => {
  console.error("[broadcast-worker] fatal", {
    errorCode: error instanceof Error ? error.message : "unknown_error",
  });
  process.exit(1);
});
