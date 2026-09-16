import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { proxy } from "./proxy";

function request(
  path: string,
  session = false,
  init?: { method?: string; headers?: Record<string, string> },
) {
  return new NextRequest(`https://app.test${path}`, {
    ...init,
    headers: {
      ...(session ? { cookie: "zenith_session=test-token" } : {}),
      ...init?.headers,
    },
  });
}

describe("proxy — Zenith session guards", () => {
  it("redirects an authenticated user away from the login page", () => {
    const res = proxy(request("/zenith-login", true));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard");
  });

  it("redirects an unauthenticated dashboard request", () => {
    const res = proxy(request("/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/zenith-login");
  });

  it("passes through an authenticated protected request", () => {
    const res = proxy(request("/contacts", true));
    expect(res.headers.get("location")).toBeNull();
  });

  it("rejects a cross-origin cookie-authenticated mutation", async () => {
    const res = proxy(
      request("/api/zenith/contacts", true, {
        method: "POST",
        headers: { origin: "https://evil.test" },
      }),
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Invalid request origin" });
  });

  it("rejects malformed native resource UUIDs before they reach PostgreSQL", async () => {
    const res = proxy(request("/api/zenith/contacts/not-a-uuid", true));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid resource identifier" });
  });
});
