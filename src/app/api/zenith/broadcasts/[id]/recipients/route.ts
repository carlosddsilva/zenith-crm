import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { broadcasts, broadcastRecipients, contacts } from "@/lib/db/schema";
import { requireZenithRole } from "@/lib/auth/zenith-account";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireZenithRole("agent");
    
    // First ensure broadcast belongs to this account
    const [b] = await db
      .select({ id: broadcasts.id })
      .from(broadcasts)
      .where(and(eq(broadcasts.id, params.id), eq(broadcasts.accountId, ctx.accountId)));

    if (!b) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Get recipients with basic contact info
    const items = await db
      .select({
        id: broadcastRecipients.id,
        status: broadcastRecipients.status,
        destination: broadcastRecipients.destination,
        attemptCount: broadcastRecipients.attemptCount,
        lastErrorCode: broadcastRecipients.lastErrorCode,
        sentAt: broadcastRecipients.sentAt,
        deliveredAt: broadcastRecipients.deliveredAt,
        failedAt: broadcastRecipients.failedAt,
        contact: {
          id: contacts.id,
          name: contacts.name,
          phone: contacts.phone
        }
      })
      .from(broadcastRecipients)
      .leftJoin(contacts, eq(broadcastRecipients.contactId, contacts.id))
      .where(eq(broadcastRecipients.broadcastId, params.id))
      .orderBy(desc(broadcastRecipients.createdAt));

    return NextResponse.json(items);
  } catch (error: any) {
    console.error("[api] broadcasts/[id]/recipients GET error:", error);
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
