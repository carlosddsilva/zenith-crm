import { NextRequest, NextResponse } from "next/server";
import { eq, and, count } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { broadcasts, broadcastRecipients } from "@/lib/db/schema";
import { requireZenithRole } from "@/lib/auth/zenith-account";
import { apiErrorResponse } from "@/lib/api/error-response";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireZenithRole("agent");
    
    const [b] = await db
      .select()
      .from(broadcasts)
      .where(and(eq(broadcasts.id, id), eq(broadcasts.accountId, ctx.accountId)));

    if (!b) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const [{ value: total }] = await db.select({ value: count() }).from(broadcastRecipients).where(eq(broadcastRecipients.broadcastId, id));
    const [{ value: sent }] = await db.select({ value: count() }).from(broadcastRecipients).where(and(eq(broadcastRecipients.broadcastId, id), eq(broadcastRecipients.status, 'sent')));
    const [{ value: failed }] = await db.select({ value: count() }).from(broadcastRecipients).where(and(eq(broadcastRecipients.broadcastId, id), eq(broadcastRecipients.status, 'failed')));
    const [{ value: delivered }] = await db.select({ value: count() }).from(broadcastRecipients).where(and(eq(broadcastRecipients.broadcastId, id), eq(broadcastRecipients.status, 'delivered')));
    const [{ value: read }] = await db.select({ value: count() }).from(broadcastRecipients).where(and(eq(broadcastRecipients.broadcastId, id), eq(broadcastRecipients.status, 'read')));
    
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
  } catch (error: unknown) {
    return apiErrorResponse(error, "[api] broadcasts/[id] GET error");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireZenithRole("admin");
    const body = await request.json();

    // Verify ownership and draft status before allowing updates
    const [existing] = await db
      .select()
      .from(broadcasts)
      .where(and(eq(broadcasts.id, id), eq(broadcasts.accountId, ctx.accountId)));

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (existing.status !== 'draft') {
      return NextResponse.json({ error: 'Can only update draft broadcasts' }, { status: 400 });
    }

    const { name, content, audience, scheduledAt, messagingChannelId } = body;

    const [updated] = await db
      .update(broadcasts)
      .set({
        name: name !== undefined ? name : existing.name,
        messagingChannelId: messagingChannelId !== undefined ? messagingChannelId : existing.messagingChannelId,
        content: content !== undefined ? content : existing.content,
        audience: audience !== undefined ? audience : existing.audience,
        scheduledAt: scheduledAt !== undefined ? (scheduledAt ? new Date(scheduledAt) : null) : existing.scheduledAt,
        updatedAt: new Date()
      })
      .where(and(eq(broadcasts.id, id), eq(broadcasts.accountId, ctx.accountId)))
      .returning();

    return NextResponse.json(updated);
  } catch (error: unknown) {
    return apiErrorResponse(error, "[api] broadcasts/[id] PATCH error");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireZenithRole("admin");

    const [existing] = await db
      .select()
      .from(broadcasts)
      .where(and(eq(broadcasts.id, id), eq(broadcasts.accountId, ctx.accountId)));

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    
    // As in legacy, we don't delete mid-send broadcasts
    if (existing.status === 'running' || existing.status === 'sending') {
      return NextResponse.json({ error: 'Cannot delete running broadcast' }, { status: 400 });
    }

    await db.delete(broadcasts).where(eq(broadcasts.id, id));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return apiErrorResponse(error, "[api] broadcasts/[id] DELETE error");
  }
}
