import { NextRequest, NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { broadcasts, broadcastRecipients, contacts, contactTags } from "@/lib/db/schema";
import { requireZenithRole } from "@/lib/auth/zenith-account";
import { sanitizePhoneForMeta, isValidE164 } from "@/lib/whatsapp/phone-utils";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await requireZenithRole("admin");

    const [b] = await db
      .select()
      .from(broadcasts)
      .where(and(eq(broadcasts.id, id), eq(broadcasts.accountId, ctx.accountId)));

    if (!b) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (b.status !== 'draft') return NextResponse.json({ error: 'Broadcast must be in draft status to start' }, { status: 400 });
    if (!b.messagingChannelId) return NextResponse.json({ error: 'Broadcast channel missing' }, { status: 400 });
    
    // Resolve Audience
    const audience = b.audience as { tags?: string[], manualContacts?: string[] } | null;
    if (!audience) return NextResponse.json({ error: 'Broadcast audience missing' }, { status: 400 });

    const contactIds = new Set<string>();

    if (audience.manualContacts && audience.manualContacts.length > 0) {
      audience.manualContacts.forEach(id => contactIds.add(id));
    }

    if (audience.tags && audience.tags.length > 0) {
      const tagged = await db
        .select({ contactId: contactTags.contactId })
        .from(contactTags)
        .where(inArray(contactTags.tagId, audience.tags));
      tagged.forEach(t => contactIds.add(t.contactId));
    }

    if (contactIds.size === 0) {
      return NextResponse.json({ error: 'Resolved audience has 0 contacts' }, { status: 400 });
    }

    const idsArray = Array.from(contactIds);

    // Filter valid contacts (with phone numbers)
    const validContacts = await db
      .select({ id: contacts.id, phone: contacts.phone })
      .from(contacts)
      .where(and(eq(contacts.accountId, ctx.accountId), inArray(contacts.id, idsArray)));

    const recipientsToInsert = validContacts
      .map(c => {
        const sanitized = sanitizePhoneForMeta(c.phone || '');
        if (!isValidE164(sanitized)) return null;
        return {
          accountId: ctx.accountId,
          broadcastId: b.id,
          contactId: c.id,
          destination: sanitized,
          status: 'pending',
          attemptCount: 0
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (recipientsToInsert.length === 0) {
      return NextResponse.json({ error: 'No valid phone numbers found in audience' }, { status: 400 });
    }

    // Snapshot in transaction
    await db.transaction(async (tx) => {
      // 1. Mark as running
      await tx
        .update(broadcasts)
        .set({ status: 'running', startedAt: new Date(), updatedAt: new Date() })
        .where(eq(broadcasts.id, b.id));

      // 2. Insert snapshot
      // Handle duplicates using insert ... on conflict do nothing in a raw sense, 
      // but we deduped in JS already by Set of contactIds.
      await tx.insert(broadcastRecipients).values(recipientsToInsert);
    });

    // Fire and forget dispatcher call to process the first batch immediately
    // In production, we'd enqueue to Redis or SQS here
    fetch(new URL('/api/zenith/workers/broadcast-dispatcher', request.url).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ broadcastId: b.id })
    }).catch(e => console.error('Failed to trigger dispatcher:', e));

    return NextResponse.json({ success: true, count: recipientsToInsert.length });
  } catch (error: any) {
    console.error("[api] broadcasts/[id]/start POST error:", error);
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
