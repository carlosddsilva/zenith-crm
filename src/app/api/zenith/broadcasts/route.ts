import { NextRequest, NextResponse } from "next/server";
import { count, eq, desc, and, ilike } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { broadcasts, broadcastRecipients, contacts, tags, contactTags } from "@/lib/db/schema";
import { requireZenithRole } from "@/lib/auth/zenith-account";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireZenithRole("agent");
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    
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

    // Get basic stats per broadcast (sent, delivered, failed)
    const broadcastsWithStats = await Promise.all(items.map(async (b) => {
      // In a real prod environment we'd use a subquery or derived table for efficiency, 
      // but map is fine for MVP limit 50
      const [{ value: total }] = await db.select({ value: count() }).from(broadcastRecipients).where(eq(broadcastRecipients.broadcastId, b.id));
      const [{ value: sent }] = await db.select({ value: count() }).from(broadcastRecipients).where(and(eq(broadcastRecipients.broadcastId, b.id), eq(broadcastRecipients.status, 'sent')));
      const [{ value: failed }] = await db.select({ value: count() }).from(broadcastRecipients).where(and(eq(broadcastRecipients.broadcastId, b.id), eq(broadcastRecipients.status, 'failed')));
      
      return {
        ...b,
        _count: {
          recipients: total,
          sent,
          failed
        }
      };
    }));

    return NextResponse.json(broadcastsWithStats);
  } catch (error: any) {
    console.error("[api] broadcasts GET error:", error);
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireZenithRole("admin"); // requiring manager to create campaigns
    const body = await request.json();
    
    // Minimal validation
    if (!body.name) {
      return NextResponse.json({ error: 'Missing name' }, { status: 400 });
    }

    // Insert broadcast draft
    const [inserted] = await db.insert(broadcasts).values({
      accountId: ctx.accountId,
      createdByUserId: ctx.userId,
      name: body.name,
      messagingChannelId: body.messagingChannelId,
      content: body.content || null,
      audience: body.audience || null,
      status: 'draft'
    }).returning();

    return NextResponse.json(inserted);
  } catch (error: any) {
    console.error("[api] broadcasts POST error:", error);
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
