import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { broadcasts, broadcastRecipients } from "@/lib/db/schema";
import { requireZenithRole } from "@/lib/auth/zenith-account";
import { apiErrorResponse } from "@/lib/api/error-response";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireZenithRole("admin");

    const [b] = await db
      .select()
      .from(broadcasts)
      .where(and(eq(broadcasts.id, id), eq(broadcasts.accountId, ctx.accountId)));

    if (!b) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (b.status === 'completed' || b.status === 'cancelled') {
      return NextResponse.json({ error: 'Broadcast already completed or cancelled' }, { status: 400 });
    }

    // Snapshot in transaction
    await db.transaction(async (tx) => {
      // 1. Mark broadcast as cancelled
      await tx
        .update(broadcasts)
        .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(broadcasts.id, b.id));

      // 2. Mark pending recipients as cancelled
      await tx
        .update(broadcastRecipients)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(and(eq(broadcastRecipients.broadcastId, b.id), eq(broadcastRecipients.status, 'pending')));
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return apiErrorResponse(error, "[api] broadcasts/[id]/cancel POST error");
  }
}
