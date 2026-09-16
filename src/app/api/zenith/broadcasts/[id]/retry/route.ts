import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireZenithRole } from "@/lib/auth/zenith-account";
import { db } from "@/lib/db/client";
import { broadcastRecipients, broadcasts } from "@/lib/db/schema";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireZenithRole("admin");
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as { scope?: unknown };
    const scope = body.scope === "failed" ? "failed" : body.scope === "pending" ? "pending" : null;
    if (!scope) return NextResponse.json({ error: "Invalid retry scope" }, { status: 400 });

    const [broadcast] = await db.select({ id: broadcasts.id }).from(broadcasts)
      .where(and(eq(broadcasts.id, id), eq(broadcasts.accountId, context.accountId))).limit(1);
    if (!broadcast) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const reset = scope === "failed"
      ? await db.update(broadcastRecipients).set({ status: "pending", lastErrorCode: null, failedAt: null, updatedAt: new Date() })
          .where(and(eq(broadcastRecipients.broadcastId, id), eq(broadcastRecipients.accountId, context.accountId), eq(broadcastRecipients.status, "failed"))).returning({ id: broadcastRecipients.id })
      : await db.select({ id: broadcastRecipients.id }).from(broadcastRecipients)
          .where(and(eq(broadcastRecipients.broadcastId, id), eq(broadcastRecipients.accountId, context.accountId), eq(broadcastRecipients.status, "pending")));

    if (reset.length > 0) {
      await db.update(broadcasts).set({ status: "running", completedAt: null, updatedAt: new Date() })
        .where(and(eq(broadcasts.id, id), eq(broadcasts.accountId, context.accountId)));
    }
    return NextResponse.json({ resuming: reset.length, remaining: 0 });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 500;
    return NextResponse.json({ error: status === 500 ? "Internal server error" : error instanceof Error ? error.message : "Request failed" }, { status });
  }
}
