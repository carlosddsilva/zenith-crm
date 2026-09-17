import { afterEach, describe, expect, it } from "vitest";

import {
  decryptMessagingCredentials,
  encryptMessagingCredentials,
} from "./credentials";

const originalKey = process.env.MESSAGING_CREDENTIALS_KEY;

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.MESSAGING_CREDENTIALS_KEY;
  } else {
    process.env.MESSAGING_CREDENTIALS_KEY = originalKey;
  }
});

describe("messaging credentials encryption", () => {
  it("round-trips credentials with the documented 64-character hex key", () => {
    process.env.MESSAGING_CREDENTIALS_KEY = "11".repeat(32);

    const encrypted = encryptMessagingCredentials({ apiKey: "synthetic-key" });

    expect(decryptMessagingCredentials(encrypted)).toEqual({
      apiKey: "synthetic-key",
    });
  });

  it("keeps accepting an existing 32-byte base64 key", () => {
    process.env.MESSAGING_CREDENTIALS_KEY = Buffer.alloc(32, 7).toString("base64");

    const encrypted = encryptMessagingCredentials({ accessToken: "synthetic-token" });

    expect(decryptMessagingCredentials(encrypted)).toEqual({
      accessToken: "synthetic-token",
    });
  });

  it("rejects keys that do not decode to 32 bytes", () => {
    process.env.MESSAGING_CREDENTIALS_KEY = "too-short";

    expect(() => encryptMessagingCredentials({ apiKey: "synthetic-key" })).toThrow(
      "MESSAGING_CREDENTIALS_KEY must be a 32-byte hex or base64 key",
    );
  });
});
