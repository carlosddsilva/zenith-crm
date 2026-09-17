import { describe, expect, it, vi } from "vitest";

import { exportContactData, ContactExportNotFoundError } from "./export";

const query = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  db: query,
}));

describe("contact data export", () => {
  it("returns a 404 domain error when the contact is outside the tenant", async () => {
    query.select.mockReturnValue(query);
    query.from.mockReturnValue(query);
    query.where.mockReturnValue(query);
    query.limit.mockResolvedValue([]);

    const context = {
      userId: "user-a",
      email: "owner-a@example.invalid",
      name: "Owner A",
      accountId: "tenant-a",
      role: "admin" as const,
      isSuspended: false,
      systemRole: "user" as const,
      account: {
        id: "tenant-a",
        name: "Tenant A",
        defaultCurrency: "BRL",
        planId: null,
      },
    };

    await expect(
      exportContactData(context, "contact-from-tenant-b"),
    ).rejects.toMatchObject({
      name: "ContactExportNotFoundError",
      status: 404,
    } satisfies Partial<ContactExportNotFoundError>);
  });
});
