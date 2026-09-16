import { timingSafeEqual } from "node:crypto";

export type WorkerAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

export function verifyWorkerRequest(request: Request): WorkerAuthResult {
  const expected = process.env.ZENITH_WORKER_SECRET;
  if (!expected) {
    console.error("[worker auth] ZENITH_WORKER_SECRET is not configured");
    return { ok: false, status: 503, error: "Worker authentication unavailable" };
  }

  const supplied = request.headers.get("x-zenith-worker-token");
  if (!supplied) return { ok: false, status: 401, error: "Unauthorized" };

  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}
