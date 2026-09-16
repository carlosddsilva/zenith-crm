import { NextRequest, NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { broadcasts, broadcastRecipients, contacts, contactTags } from "@/lib/db/schema";
import { requireZenithRole } from "@/lib/auth/zenith-account";
import { sanitizePhoneForMeta, isValidE164 } from "@/lib/whatsapp/phone-utils";
import { getMessagingChannel } from "@/lib/messaging/channel-store";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const MAX_BROADCAST_RECIPIENTS = 5_000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await requireZenithRole("admin");
    const rateLimit = checkRateLimit(
      `broadcast-start:${ctx.accountId}:${ctx.userId}`,
      RATE_LIMITS.broadcast,
    );
    if (!rateLimit.success) return rateLimitResponse(rateLimit);

    const [b] = await db
      .select()
      .from(broadcasts)
      .where(and(eq(broadcasts.id, id), eq(broadcasts.accountId, ctx.accountId)));

    if (!b) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (b.status !== 'draft') return NextResponse.json({ error: 'Broadcast must be in draft status to start' }, { status: 400 });
    if (!b.messagingChannelId) return NextResponse.json({ error: 'Broadcast channel missing' }, { status: 400 });

    const channel = await getMessagingChannel(ctx.accountId, b.messagingChannelId);
    if (!channel) {
      return NextResponse.json({ error: 'Broadcast channel is unavailable' }, { status: 409 });
    }
    
    // Resolve Audience
    const audience = b.audience as {
      type?: "all" | "tags" | "manual";
      tags?: string[];
      manualContacts?: string[];
    } | null;
    if (!audience) return NextResponse.json({ error: 'Broadcast audience missing' }, { status: 400 });

    const contactIds = new Set<string>();

    if (audience.type === "all") {
      const allContacts = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.accountId, ctx.accountId))
        .limit(MAX_BROADCAST_RECIPIENTS + 1);
      allContacts.forEach((contact) => contactIds.add(contact.id));
    }

    if (audience.manualContacts && audience.manualContacts.length > 0) {
      audience.manualContacts.forEach(id => contactIds.add(id));
    }

    if (audience.tags && audience.tags.length > 0) {
      const tagged = await db
        .select({ contactId: contactTags.contactId })
        .from(contactTags)
        .innerJoin(contacts, eq(contacts.id, contactTags.contactId))
        .where(
          and(
            eq(contacts.accountId, ctx.accountId),
            inArray(contactTags.tagId, audience.tags),
          ),
        )
        .limit(MAX_BROADCAST_RECIPIENTS + 1);
      tagged.forEach(t => contactIds.add(t.contactId));
    }

    if (contactIds.size === 0) {
      return NextResponse.json({ error: 'Resolved audience has 0 contacts' }, { status: 400 });
    }

    if (contactIds.size > MAX_BROADCAST_RECIPIENTS) {
      return NextResponse.json(
        { error: `Broadcast audience exceeds ${MAX_BROADCAST_RECIPIENTS} recipients` },
        { status: 413 },
      );
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

    return NextResponse.json({ success: true, count: recipientsToInsert.length });
  } catch (error: unknown) {
    console.error("[broadcast start] failed", {
      errorCode: error instanceof Error ? error.name : "UnknownError",
    });
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 500;
    return NextResponse.json(
      {
        error:
          status < 500 && error instanceof Error
            ? error.message
            : "Internal server error",
      },
      { status },
    );
  }
}
