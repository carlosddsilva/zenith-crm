import {
  and,
  eq,
  sql,
} from "drizzle-orm";

import { db } from "@/lib/db/client";

import {
  contacts,
  conversations,
  messages,
  messagingChannels,
} from "@/lib/db/schema";

import {
  normalizePhone,
} from "@/lib/whatsapp/phone-utils";

export type InboundContentType =
  | "text"
  | "image"
  | "document"
  | "audio"
  | "video"
  | "location"
  | "interactive";

export interface NormalizedInboundMessage {
  providerMessageId:
    string;

  from:
    string;

  contactName?:
    string | null;

  contentType:
    InboundContentType;

  text?:
    string | null;

  mediaUrl?:
    string | null;

  mediaType?:
    string | null;

  interactiveReplyId?:
    string | null;

  interactivePayload?:
    Record<
      string,
      unknown
    > | null;

  replyToProviderMessageId?:
    string | null;

  occurredAt?:
    Date;
}

export interface PersistInboundResult {
  messageId:
    string;

  conversationId:
    string;

  contactId:
    string;

  duplicate:
    boolean;
}

function previewForMessage(
  message:
    NormalizedInboundMessage,
): string {
  if (
    message.text?.trim()
  ) {
    return message.text.trim();
  }

  switch (
    message.contentType
  ) {
    case "image":
      return "[Imagem]";

    case "document":
      return "[Documento]";

    case "audio":
      return "[Áudio]";

    case "video":
      return "[Vídeo]";

    case "location":
      return "[Localização]";

    case "interactive":
      return "[Resposta interativa]";

    default:
      return "[Mensagem]";
  }
}

export async function persistInboundMessage(
  messagingChannelId:
    string,

  inbound:
    NormalizedInboundMessage,
): Promise<PersistInboundResult> {
  const [channel] =
    await db
      .select()
      .from(
        messagingChannels,
      )
      .where(
        and(
          eq(
            messagingChannels.id,
            messagingChannelId,
          ),

          eq(
            messagingChannels.isActive,
            true,
          ),
        ),
      )
      .limit(1);

  if (!channel) {
    throw new Error(
      "Messaging channel not found or inactive",
    );
  }

  const phone =
    normalizePhone(
      inbound.from,
    );

  if (
    !phone ||
    phone.length < 7 ||
    phone.length > 15
  ) {
    throw new Error(
      "Invalid inbound phone number",
    );
  }

  /*
   * Idempotência antecipada.
   */
  const [existingMessage] =
    await db
      .select({
        id:
          messages.id,

        conversationId:
          messages.conversationId,
      })
      .from(messages)
      .where(
        and(
          eq(
            messages.messagingChannelId,
            channel.id,
          ),

          eq(
            messages.messageId,
            inbound.providerMessageId,
          ),
        ),
      )
      .limit(1);

  if (existingMessage) {
    const [existingConversation] =
      await db
        .select({
          contactId:
            conversations.contactId,
        })
        .from(conversations)
        .where(
          eq(
            conversations.id,
            existingMessage.conversationId,
          ),
        )
        .limit(1);

    return {
      messageId:
        existingMessage.id,

      conversationId:
        existingMessage.conversationId,

      contactId:
        existingConversation
          ?.contactId ?? "",

      duplicate:
        true,
    };
  }

  return db.transaction(
    async (tx) => {
      /*
       * CONTATO
       */
      let [contact] =
        await tx
          .select()
          .from(contacts)
          .where(
            and(
              eq(
                contacts.accountId,
                channel.accountId,
              ),

              eq(
                contacts.phoneNormalized,
                phone,
              ),
            ),
          )
          .limit(1);

      if (!contact) {
        const [created] =
          await tx
            .insert(contacts)
            .values({
              accountId:
                channel.accountId,

              userId:
                channel.createdByUserId,

              phone,

              phoneNormalized:
                phone,

              name:
                inbound.contactName
                  ?.trim() ||
                phone,
            })
            .onConflictDoNothing({
              target: [
                contacts.accountId,
                contacts.phoneNormalized,
              ],
            })
            .returning();

        if (created) {
          contact = created;
        } else {
          [contact] =
            await tx
              .select()
              .from(contacts)
              .where(
                and(
                  eq(
                    contacts.accountId,
                    channel.accountId,
                  ),

                  eq(
                    contacts.phoneNormalized,
                    phone,
                  ),
                ),
              )
              .limit(1);
        }
      } else if (
        inbound.contactName?.trim() &&
        (!contact.name ||
          contact.name ===
            contact.phone)
      ) {
        const [updated] =
          await tx
            .update(contacts)
            .set({
              name:
                inbound.contactName.trim(),

              updatedAt:
                new Date(),
            })
            .where(
              eq(
                contacts.id,
                contact.id,
              ),
            )
            .returning();

        contact =
          updated ?? contact;
      }

      if (!contact) {
        throw new Error(
          "Failed to resolve inbound contact",
        );
      }

      /*
       * CONVERSA
       */
      let [conversation] =
        await tx
          .select()
          .from(conversations)
          .where(
            and(
              eq(
                conversations.accountId,
                channel.accountId,
              ),

              eq(
                conversations.contactId,
                contact.id,
              ),
            ),
          )
          .limit(1);

      if (!conversation) {
        const [created] =
          await tx
            .insert(
              conversations,
            )
            .values({
              accountId:
                channel.accountId,

              userId:
                channel.createdByUserId,

              contactId:
                contact.id,

              status:
                "open",
            })
            .onConflictDoNothing({
              target: [
                conversations.accountId,
                conversations.contactId,
              ],
            })
            .returning();

        if (created) {
          conversation =
            created;
        } else {
          [conversation] =
            await tx
              .select()
              .from(
                conversations,
              )
              .where(
                and(
                  eq(
                    conversations.accountId,
                    channel.accountId,
                  ),

                  eq(
                    conversations.contactId,
                    contact.id,
                  ),
                ),
              )
              .limit(1);
        }
      }

      if (!conversation) {
        throw new Error(
          "Failed to resolve inbound conversation",
        );
      }

      /*
       * Uma nova mensagem do cliente
       * reabre uma conversa fechada.
       */
      const occurredAt =
        inbound.occurredAt ??
        new Date();

      /*
       * Reply/quote opcional.
       */
      let replyToMessageId:
        string | null = null;

      if (
        inbound.replyToProviderMessageId
      ) {
        const [reply] =
          await tx
            .select({
              id:
                messages.id,
            })
            .from(messages)
            .where(
              and(
                eq(
                  messages.conversationId,
                  conversation.id,
                ),

                eq(
                  messages.messagingChannelId,
                  channel.id,
                ),

                eq(
                  messages.messageId,
                  inbound.replyToProviderMessageId,
                ),
              ),
            )
            .limit(1);

        replyToMessageId =
          reply?.id ??
          null;
      }

      /*
       * MENSAGEM
       */
      const [message] =
        await tx
          .insert(messages)
          .values({
            conversationId:
              conversation.id,

            senderType:
              "customer",

            senderId:
              null,

            contentType:
              inbound.contentType,

            contentText:
              inbound.text ??
              null,

            mediaUrl:
              inbound.mediaUrl ??
              null,

            mediaType:
              inbound.mediaType ??
              null,

            messageId:
              inbound.providerMessageId,

            provider:
              channel.provider,

            messagingChannelId:
              channel.id,

            transportError:
              null,

            status:
              "delivered",

            replyToMessageId,

            interactiveReplyId:
              inbound.interactiveReplyId ??
              null,

            interactivePayload:
              inbound.interactivePayload ??
              null,

            aiGenerated:
              false,

            createdAt:
              occurredAt,
          })
          .onConflictDoNothing()
          .returning();

      /*
       * Uma corrida pode ter inserido
       * a mesma mensagem.
       */
      if (!message) {
        const [duplicate] =
          await tx
            .select({
              id:
                messages.id,
            })
            .from(messages)
            .where(
              and(
                eq(
                  messages.messagingChannelId,
                  channel.id,
                ),

                eq(
                  messages.messageId,
                  inbound.providerMessageId,
                ),
              ),
            )
            .limit(1);

        if (!duplicate) {
          throw new Error(
            "Inbound message conflict could not be resolved",
          );
        }

        return {
          messageId:
            duplicate.id,

          conversationId:
            conversation.id,

          contactId:
            contact.id,

          duplicate:
            true,
        };
      }

      /*
       * Atualiza thread somente para
       * mensagem realmente nova.
       */
      await tx
        .update(
          conversations,
        )
        .set({
          status:
            "open",

          lastMessageText:
            previewForMessage(
              inbound,
            ),

          lastMessageAt:
            occurredAt,

          unreadCount:
            sql`${conversations.unreadCount} + 1`,

          firstUnrepliedMessageAt:
            sql`COALESCE(${conversations.firstUnrepliedMessageAt}, ${occurredAt})`,

          updatedAt:
            new Date(),
        })
        .where(
          and(
            eq(
              conversations.id,
              conversation.id,
            ),

            eq(
              conversations.accountId,
              channel.accountId,
            ),
          ),
        );

      const { publishEvent } = await import('@/lib/events/bus');
      await publishEvent(tx, {
        accountId: channel.accountId,
        triggerType: 'message.received',
        entityType: 'message',
        entityId: message.id,
        payload: {
          messageId: message.id,
          conversationId: conversation.id,
          contactId: contact.id,
        },
      });

      const { enqueueAiReply } = await import("@/lib/ai/jobs");
      await enqueueAiReply(tx, {
        accountId: channel.accountId,
        conversationId: conversation.id,
        contactId: contact.id,
        sourceMessageId: message.id,
      });

      if (!conversation.firstUnrepliedMessageAt) {
        await publishEvent(tx, {
          accountId: channel.accountId,
          triggerType: 'conversation.sla_started',
          entityType: 'conversation',
          entityId: conversation.id,
          payload: {
            conversationId: conversation.id,
            contactId: contact.id,
          },
        });
      }

      return {
        messageId:
          message.id,
        
        conversationId:
          conversation.id,

        contactId:
          contact.id,

        duplicate:
          false,
      };
    },
  );
}

