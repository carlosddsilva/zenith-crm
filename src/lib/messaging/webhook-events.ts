import {
  createHash,
} from "node:crypto";

import {
  and,
  eq,
} from "drizzle-orm";

import { db } from "@/lib/db/client";

import {
  messagingWebhookEvents,
} from "@/lib/db/schema";

export function hashWebhookPayload(
  raw: string,
): string {
  return createHash("sha256")
    .update(raw, "utf8")
    .digest("hex");
}

export async function beginWebhookEvent(
  input: {
    accountId: string;
    messagingChannelId: string;
    provider:
      | "meta"
      | "evolution";
    eventKey: string;
    eventType?: string | null;
    rawPayload: string;
  },
) {
  const [created] =
    await db
      .insert(
        messagingWebhookEvents,
      )
      .values({
        accountId:
          input.accountId,

        messagingChannelId:
          input.messagingChannelId,

        provider:
          input.provider,

        eventKey:
          input.eventKey,

        eventType:
          input.eventType ??
          null,

        payloadHash:
          hashWebhookPayload(
            input.rawPayload,
          ),

        status:
          "received",
      })
      .onConflictDoNothing({
        target: [
          messagingWebhookEvents.messagingChannelId,
          messagingWebhookEvents.eventKey,
        ],
      })
      .returning();

  return created ?? null;
}

export async function finishWebhookEvent(
  id: string,
  status:
    | "processed"
    | "ignored"
    | "failed",
  error?: string | null,
) {
  await db
    .update(
      messagingWebhookEvents,
    )
    .set({
      status,
      error:
        error ?? null,
      processedAt:
        new Date(),
    })
    .where(
      eq(
        messagingWebhookEvents.id,
        id,
      ),
    );
}
