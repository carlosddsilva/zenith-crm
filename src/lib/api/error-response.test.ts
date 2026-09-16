import { describe, expect, it, vi } from "vitest";

import {
  ZenithForbiddenError,
  ZenithUnauthorizedError,
} from "@/lib/auth/zenith-account";

import { apiErrorResponse } from "./error-response";

describe("apiErrorResponse", () => {
  it("maps native authentication errors without logging them", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const unauthorized = apiErrorResponse(
      new ZenithUnauthorizedError(),
      "test",
    );
    const forbidden = apiErrorResponse(new ZenithForbiddenError(), "test");

    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({ error: "Unauthorized" });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: "Forbidden" });
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("hides and logs unexpected errors", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = apiErrorResponse(new Error("database detail"), "test");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
    expect(consoleSpy).toHaveBeenCalledOnce();

    consoleSpy.mockRestore();
  });
});
