import {
  eq,
} from "drizzle-orm";

import { db } from "@/lib/db/client";

import {
  messagingChannels,
} from "@/lib/db/schema";

import {
  publishInboxEvent,
} from "@/lib/realtime";

import {
  persistInboundMessage,
} from "./inbound";

import type {
  NormalizedInboundMessage,
  PersistInboundResult,
} from "./inbound";

export async function persistInboundMessageRealtime(
  messagingChannelId:
    string,

  inbound:
    NormalizedInboundMessage,
): Promise<PersistInboundResult> {
  const result =
    await persistInboundMessage(
      messagingChannelId,
      inbound,
    );

  /*
   * Evento duplicado não deve gerar
   * refresh/notificação novamente.
   */
  if (result.duplicate) {
    return result;
  }

  const [channel] =
    await db
      .select({
        accountId:
          messagingChannels
            .accountId,
      })
      .from(
        messagingChannels,
      )
      .where(
        eq(
          messagingChannels.id,
          messagingChannelId,
        ),
      )
      .limit(1);

  if (channel) {
    try {
      await publishInboxEvent(
        channel.accountId,
        {
          type:
            "message.created",

          conversationId:
            result.conversationId,

          messageId:
            result.messageId,
        },
      );
    } catch (error) {
      /*
       * Redis não pode provocar rollback
       * ou perda de uma mensagem que já
       * foi persistida no PostgreSQL.
       */
      console.error(
        "[inbound realtime publish]",
        {
          errorCode: error instanceof Error ? error.name : "UnknownError",
        },
      );
    }
  }

  return result;
}
