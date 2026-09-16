import { NextRequest, NextResponse } from "next/server";
import { eq, desc, and, ilike, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { broadcasts, broadcastRecipients } from "@/lib/db/schema";
import { requireZenithRole } from "@/lib/auth/zenith-account";
import { apiErrorResponse } from "@/lib/api/error-response";
import { getMessagingChannel } from "@/lib/messaging/channel-store";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createBroadcastSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    messagingChannelId: z.uuid(),
    content: z
      .object({
        type: z.literal("text"),
        text: z.string().trim().min(1).max(4_096),
      })
      .strict(),
    audience: z
      .object({
        type: z.enum(["all", "tags", "manual"]),
        tags: z.array(z.uuid()).max(100).optional(),
        manualContacts: z.array(z.uuid()).max(5_000).optional(),
        excludeTagIds: z.array(z.uuid()).max(100).optional(),
      })
      .strict(),
  })
  .strict();

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireZenithRole("agent");
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.slice(0, 100);
    
    // Base conditions
    const conditions = [eq(broadcasts.accountId, ctx.accountId)];
    if (search) {
      conditions.push(ilike(broadcasts.name, `%${search}%`));
    }

    const items = await db
      .select()
      .from(broadcasts)
      .where(and(...conditions))
      .orderBy(desc(broadcasts.createdAt))
      .limit(50); // basic limit for now

    const stats = items.length === 0 ? [] : await db.select({
      broadcastId: broadcastRecipients.broadcastId,
      recipients: sql<number>`count(*)::int`,
      sent: sql<number>`count(*) filter (where ${broadcastRecipients.status} = 'sent')::int`,
      failed: sql<number>`count(*) filter (where ${broadcastRecipients.status} = 'failed')::int`,
    }).from(broadcastRecipients)
      .where(and(eq(broadcastRecipients.accountId, ctx.accountId), inArray(broadcastRecipients.broadcastId, items.map((item) => item.id))))
      .groupBy(broadcastRecipients.broadcastId);
    const statsByBroadcast = new Map(stats.map((row) => [row.broadcastId, row]));
    const broadcastsWithStats = items.map((broadcast) => ({
      ...broadcast,
      _count: statsByBroadcast.get(broadcast.id) ?? { recipients: 0, sent: 0, failed: 0 },
    }));

    return NextResponse.json(broadcastsWithStats);
  } catch (error: unknown) {
    return apiErrorResponse(error, "[api] broadcasts GET error");
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireZenithRole("admin"); // requiring manager to create campaigns
    const parsed = createBroadcastSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid broadcast" },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const channel = await getMessagingChannel(ctx.accountId, body.messagingChannelId);
    if (!channel) {
      return NextResponse.json({ error: "Messaging channel not found" }, { status: 404 });
    }

    // Insert broadcast draft
    const [inserted] = await db.insert(broadcasts).values({
      accountId: ctx.accountId,
      createdByUserId: ctx.userId,
      name: body.name,
      messagingChannelId: body.messagingChannelId,
      content: body.content,
      audience: body.audience,
      status: 'draft'
    }).returning();

    return NextResponse.json(inserted, { status: 201 });
  } catch (error: unknown) {
    return apiErrorResponse(error, "[api] broadcasts POST error");
  }
}
