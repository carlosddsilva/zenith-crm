import { NextRequest, NextResponse } from "next/server";
import { eq, and, count } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { broadcasts, broadcastRecipients } from "@/lib/db/schema";
import { requireZenithRole } from "@/lib/auth/zenith-account";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireZenithRole("agent");
    
    const [b] = await db
      .select()
      .from(broadcasts)
      .where(and(eq(broadcasts.id, params.id), eq(broadcasts.accountId, ctx.accountId)));

    if (!b) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const [{ value: total }] = await db.select({ value: count() }).from(broadcastRecipients).where(eq(broadcastRecipients.broadcastId, params.id));
    const [{ value: sent }] = await db.select({ value: count() }).from(broadcastRecipients).where(and(eq(broadcastRecipients.broadcastId, params.id), eq(broadcastRecipients.status, 'sent')));
    const [{ value: failed }] = await db.select({ value: count() }).from(broadcastRecipients).where(and(eq(broadcastRecipients.broadcastId, params.id), eq(broadcastRecipients.status, 'failed')));
    const [{ value: delivered }] = await db.select({ value: count() }).from(broadcastRecipients).where(and(eq(broadcastRecipients.broadcastId, params.id), eq(broadcastRecipients.status, 'delivered')));
    const [{ value: read }] = await db.select({ value: count() }).from(broadcastRecipients).where(and(eq(broadcastRecipients.broadcastId, params.id), eq(broadcastRecipients.status, 'read')));
    
    return NextResponse.json({
      ...b,
      _count: {
        recipients: total,
        sent,
        failed,
        delivered,
        read
      }
    });
  } catch (error: any) {
    console.error("[api] broadcasts/[id] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireZenithRole("admin");
    const body = await request.json();

    // Verify ownership and draft status before allowing updates
    const [existing] = await db
      .select()
      .from(broadcasts)
      .where(and(eq(broadcasts.id, params.id), eq(broadcasts.accountId, ctx.accountId)));

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (existing.status !== 'draft') {
      return NextResponse.json({ error: 'Can only update draft broadcasts' }, { status: 400 });
    }

    const [updated] = await db
      .update(broadcasts)
      .set({
        name: body.name !== undefined ? body.name : existing.name,
        messagingChannelId: body.messagingChannelId !== undefined ? body.messagingChannelId : existing.messagingChannelId,
        content: body.content !== undefined ? body.content : existing.content,
        audience: body.audience !== undefined ? body.audience : existing.audience,
        updatedAt: new Date()
      })
      .where(eq(broadcasts.id, params.id))
      .returning();

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("[api] broadcasts/[id] PATCH error:", error);
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireZenithRole("admin");

    const [existing] = await db
      .select()
      .from(broadcasts)
      .where(and(eq(broadcasts.id, params.id), eq(broadcasts.accountId, ctx.accountId)));

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    
    // As in legacy, we don't delete mid-send broadcasts
    if (existing.status === 'running' || existing.status === 'sending') {
      return NextResponse.json({ error: 'Cannot delete running broadcast' }, { status: 400 });
    }

    await db.delete(broadcasts).where(eq(broadcasts.id, params.id));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[api] broadcasts/[id] DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
