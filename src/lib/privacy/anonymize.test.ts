import { describe, it, expect, vi } from "vitest";
import { anonymizeContact } from "./anonymize";
import { db } from "@/lib/db/client";
import * as logger from "@/lib/audit/logger";

vi.mock("@/lib/db/client", () => ({
  db: {
    transaction: vi.fn((cb) => cb({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: "contact-1", anonymizedAt: null, phoneNormalized: "123" }]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: "contact-1", name: "Anônimo", phoneNormalized: "[REDACTED]-abc", isBlocked: true, optOut: true }]),
    })),
  }
}));

describe("LGPD Anonymization", () => {
  it("should anonymize the contact and redact notes", async () => {
    const context = {
      userId: "user-1",
      email: "owner@example.com",
      name: "Owner",
      accountId: "acc-1",
      role: "admin" as const,
      isSuspended: false,
      systemRole: "user" as const,
      account: { id: "acc-1", name: "Test Tenant", defaultCurrency: "BRL", planId: null },
    };

    vi.spyOn(logger, "logAuditAction").mockResolvedValue();

    const result = await anonymizeContact(context, "contact-1");

    expect(result.name).toBe("Anônimo");
    expect(result.phoneNormalized).toContain("[REDACTED]");
    expect(result.isBlocked).toBe(true);
    expect(result.optOut).toBe(true);
    expect(db.transaction).toHaveBeenCalled();
    expect(logger.logAuditAction).toHaveBeenCalledWith(expect.objectContaining({
      action: "ANONYMIZE",
      entityType: "CONTACT",
    }));
  });
});

