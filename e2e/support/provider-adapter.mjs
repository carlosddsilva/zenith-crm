import { randomUUID } from "node:crypto";
import http from "node:http";

const requests = [];

const server = http.createServer(async (request, response) => {
  if (request.url === "/health") {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ok: true, adapter: "e2e-only" }));
    return;
  }

  if (request.url === "/__requests") {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ requests }));
    return;
  }

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  requests.push({
    method: request.method,
    url: request.url,
    body: Buffer.concat(chunks).toString("utf8"),
  });

  if (request.url?.startsWith("/message/sendText/")) {
    response.statusCode = 201;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ messageId: `e2e-${randomUUID()}` }));
    return;
  }

  response.statusCode = 404;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ error: "unsupported e2e adapter operation" }));
});

server.listen(3199, "127.0.0.1");

function stop() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
