import { and, count, eq, inArray, lt } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { broadcastRecipients, broadcasts, contacts } from "@/lib/db/schema";
import { getMessagingProvider, MessagingProviderError } from "@/lib/messaging";
import { getMessagingChannel } from "@/lib/messaging/channel-store";
import { verifyWorkerRequest } from "@/lib/workers/auth";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 10;
const PROCESSING_LEASE_MS = 5 * 60_000;

interface BroadcastContent {
  type?: "text";
  text?: string;
}

function providerErrorCode(error: unknown) {
  if (error instanceof MessagingProviderError) return error.code;
  return "provider_send_failed";
}

export async function POST(request: Request) {
  const auth = verifyWorkerRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      broadcastId?: string;
    };

    const candidates = await db
      .select({ broadcast: broadcasts })
      .from(broadcasts)
      .innerJoin(
        broadcastRecipients,
        and(
          eq(broadcastRecipients.broadcastId, broadcasts.id),
          eq(broadcastRecipients.accountId, broadcasts.accountId),
          inArray(broadcastRecipients.status, ["pending", "processing"]),
        ),
      )
      .where(
        body.broadcastId
          ? and(
              eq(broadcasts.id, body.broadcastId),
              eq(broadcasts.status, "running"),
            )
          : eq(broadcasts.status, "running"),
      )
      .limit(1);

    const campaign = candidates[0]?.broadcast;
    if (!campaign) {
      return NextResponse.json({ processed: 0, idle: true });
    }

    const now = new Date();
    await db
      .update(broadcastRecipients)
      .set({
        status: "failed",
        failedAt: now,
        updatedAt: now,
        lastErrorCode: "delivery_state_unknown",
      })
      .where(
        and(
          eq(broadcastRecipients.accountId, campaign.accountId),
          eq(broadcastRecipients.broadcastId, campaign.id),
          eq(broadcastRecipients.status, "processing"),
          lt(
            broadcastRecipients.updatedAt,
            new Date(now.getTime() - PROCESSING_LEASE_MS),
          ),
        ),
      );

    if (!campaign.messagingChannelId) {
      await db
        .update(broadcasts)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(broadcasts.id, campaign.id));
      return NextResponse.json({ error: "Broadcast channel missing" }, { status: 409 });
    }

    const content = campaign.content as BroadcastContent | null;
    const text = content?.text?.trim();
    if (content?.type !== "text" || !text) {
      await db
        .update(broadcasts)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(broadcasts.id, campaign.id));
      return NextResponse.json({ error: "Unsupported broadcast content" }, { status: 409 });
    }

    const channel = await getMessagingChannel(
      campaign.accountId,
      campaign.messagingChannelId,
    );
    if (!channel) {
      await db
        .update(broadcasts)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(broadcasts.id, campaign.id));
      return NextResponse.json({ error: "Messaging channel unavailable" }, { status: 409 });
    }

    const claimable = db
      .select({ id: broadcastRecipients.id })
      .from(broadcastRecipients)
      .where(
        and(
          eq(broadcastRecipients.accountId, campaign.accountId),
          eq(broadcastRecipients.broadcastId, campaign.id),
          eq(broadcastRecipients.status, "pending"),
        ),
      )
      .limit(BATCH_SIZE);

    const claimed = await db
      .update(broadcastRecipients)
      .set({ status: "processing", updatedAt: new Date() })
      .where(
        and(
          inArray(broadcastRecipients.id, claimable),
          eq(broadcastRecipients.accountId, campaign.accountId),
          eq(broadcastRecipients.broadcastId, campaign.id),
          eq(broadcastRecipients.status, "pending"),
        ),
      )
      .returning();

    const provider = getMessagingProvider(channel.provider);
    let sent = 0;
    let failed = 0;

    for (const recipient of claimed) {
      try {
        if (!recipient.destination) throw new Error("recipient_destination_missing");

        if (recipient.contactId) {
          const [contact] = await db.select({ isBlocked: contacts.isBlocked, optOut: contacts.optOut, anonymizedAt: contacts.anonymizedAt }).from(contacts).where(eq(contacts.id, recipient.contactId)).limit(1);
          if (contact && (contact.isBlocked || contact.optOut || contact.anonymizedAt)) {
             throw new Error("contact_lgpd_blocked");
          }
        }

        await provider.send(
          {
            to: recipient.destination,
            contentType: "text",
            purpose: "marketing",
            mode: "broadcast",
            text,
          },
          channel.config,
        );
        await db
          .update(broadcastRecipients)
          .set({
            status: "sent",
            sentAt: new Date(),
            updatedAt: new Date(),
            attemptCount: recipient.attemptCount + 1,
            lastErrorCode: null,
          })
          .where(
            and(
              eq(broadcastRecipients.id, recipient.id),
              eq(broadcastRecipients.accountId, campaign.accountId),
              eq(broadcastRecipients.status, "processing"),
            ),
          );
        sent += 1;
      } catch (error) {
        console.error("[broadcast worker] provider send failed", {
          broadcastId: campaign.id,
          recipientId: recipient.id,
          errorCode: providerErrorCode(error),
        });
        await db
          .update(broadcastRecipients)
          .set({
            status: "failed",
            failedAt: new Date(),
            updatedAt: new Date(),
            attemptCount: recipient.attemptCount + 1,
            lastErrorCode: providerErrorCode(error),
          })
          .where(
            and(
              eq(broadcastRecipients.id, recipient.id),
              eq(broadcastRecipients.accountId, campaign.accountId),
              eq(broadcastRecipients.status, "processing"),
            ),
          );
        failed += 1;
      }
    }

    const [pending] = await db
      .select({ value: count() })
      .from(broadcastRecipients)
      .where(
        and(
          eq(broadcastRecipients.accountId, campaign.accountId),
          eq(broadcastRecipients.broadcastId, campaign.id),
          inArray(broadcastRecipients.status, ["pending", "processing"]),
        ),
      );

    const [failedRecipients] = await db
      .select({ value: count() })
      .from(broadcastRecipients)
      .where(
        and(
          eq(broadcastRecipients.accountId, campaign.accountId),
          eq(broadcastRecipients.broadcastId, campaign.id),
          eq(broadcastRecipients.status, "failed"),
        ),
      );

    if (Number(pending?.value ?? 0) === 0) {
      await db
        .update(broadcasts)
        .set({
          status: Number(failedRecipients?.value ?? 0) > 0 ? "failed" : "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(broadcasts.id, campaign.id),
            eq(broadcasts.accountId, campaign.accountId),
            eq(broadcasts.status, "running"),
          ),
        );
    }

    return NextResponse.json({ processed: claimed.length, sent, failed });
  } catch (error) {
    console.error("[broadcast worker] dispatch failed", {
      errorCode: error instanceof Error ? error.name : "unknown_error",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
