import { NextResponse } from "next/server";

import {
  and,
  count,
  desc,
  eq,
} from "drizzle-orm";

import { db } from "@/lib/db/client";

import {
  contacts,
  conversations,
  messages,
} from "@/lib/db/schema";

import {
  getZenithAccountContext,
  requireZenithRole,
} from "@/lib/auth/zenith-account";

import {
  getDefaultServiceChannel,
} from "@/lib/messaging/channel-store";

import {
  getMessagingProvider,
  MessagingProviderError,
} from "@/lib/messaging";

import type {
  MessagingContentType,
  MessagingInteractivePayload,
} from "@/lib/messaging";

const contentTypes = [
  "text",
  "image",
  "document",
  "audio",
  "video",
  "location",
  "template",
  "interactive",
] as const;

type ContentType =
  (typeof contentTypes)[number];

function isContentType(
  value: unknown,
): value is ContentType {
  return (
    typeof value === "string" &&
    contentTypes.includes(
      value as ContentType,
    )
  );
}

const providerContentTypes:
  MessagingContentType[] = [
  "text",
  "image",
  "document",
  "audio",
  "video",
  "template",
  "interactive",
];

function isProviderContentType(
  value: ContentType,
): value is MessagingContentType {
  return providerContentTypes.includes(
    value as MessagingContentType,
  );
}

function errorResponse(
  error: unknown,
) {
  console.error(
    "[zenith conversation messages]",
    error,
  );

  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (
      error as {
        status?: unknown;
      }
    ).status === "number"
  ) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Request failed",
      },
      {
        status: (
          error as {
            status: number;
          }
        ).status,
      },
    );
  }

  return NextResponse.json(
    {
      error:
        "Internal server error",
    },
    { status: 500 },
  );
}

async function ensureConversation(
  id: string,
  accountId: string,
) {
  const [conversation] =
    await db
      .select({
        id:
          conversations.id,

        contactId:
          conversations.contactId,
      })
      .from(conversations)
      .where(
        and(
          eq(
            conversations.id,
            id,
          ),
          eq(
            conversations.accountId,
            accountId,
          ),
        ),
      )
      .limit(1);

  return conversation;
}

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  try {
    const context =
      await getZenithAccountContext();

    const { id } =
      await params;

    const conversation =
      await ensureConversation(
        id,
        context.accountId,
      );

    if (!conversation) {
      return NextResponse.json(
        {
          error:
            "Conversation not found",
        },
        { status: 404 },
      );
    }

    const url =
      new URL(request.url);

    const requestedPage =
      Number(
        url.searchParams.get(
          "page",
        ) ?? "1",
      );

    const requestedPageSize =
      Number(
        url.searchParams.get(
          "pageSize",
        ) ?? "100",
      );

    const page =
      Number.isFinite(
        requestedPage,
      ) &&
      requestedPage > 0
        ? Math.floor(
            requestedPage,
          )
        : 1;

    const pageSize =
      Number.isFinite(
        requestedPageSize,
      ) &&
      requestedPageSize > 0
        ? Math.min(
            Math.floor(
              requestedPageSize,
            ),
            200,
          )
        : 100;

    const [totalRow] =
      await db
        .select({
          total: count(),
        })
        .from(messages)
        .where(
          eq(
            messages.conversationId,
            id,
          ),
        );

    const rows =
      await db
        .select()
        .from(messages)
        .where(
          eq(
            messages.conversationId,
            id,
          ),
        )
        .orderBy(
          desc(
            messages.createdAt,
          ),
          desc(messages.id),
        )
        .limit(pageSize)
        .offset(
          (page - 1) *
            pageSize,
        );

    return NextResponse.json({
      items:
        rows.map(
          (message) => ({
            id:
              message.id,

            conversation_id:
              message.conversationId,

            direction:
              message.senderType ===
              "customer"
                ? "inbound"
                : "outbound",

            sender_type:
              message.senderType,

            sender_id:
              message.senderId,

            content_type:
              message.contentType,

            content_text:
              message.contentText,

            media_url:
              message.mediaUrl,

            media_type:
              message.mediaType,

            template_name:
              message.templateName,

            message_id:
              message.messageId,

            provider:
              message.provider,

            messaging_channel_id:
              message.messagingChannelId,

            transport_error:
              message.transportError,

            status:
              message.status,

            reply_to_message_id:
              message.replyToMessageId,

            interactive_reply_id:
              message.interactiveReplyId,

            interactive_payload:
              message.interactivePayload,

            ai_generated:
              message.aiGenerated,

            created_at:
              message.createdAt,
          }),
        ),

      pagination: {
        page,
        pageSize,

        total:
          Number(
            totalRow?.total ??
              0,
          ),
      },
    });
  } catch (error) {
    return errorResponse(
      error,
    );
  }
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  try {
    const context =
      await requireZenithRole(
        "agent",
      );

    const { id } =
      await params;

    const conversation =
      await ensureConversation(
        id,
        context.accountId,
      );

    if (!conversation) {
      return NextResponse.json(
        {
          error:
            "Conversation not found",
        },
        { status: 404 },
      );
    }

    const [contact] =
      await db
        .select({
          id:
            contacts.id,

          phone:
            contacts.phone,

          phoneNormalized:
            contacts.phoneNormalized,
        })
        .from(contacts)
        .where(
          and(
            eq(
              contacts.id,
              conversation.contactId,
            ),
            eq(
              contacts.accountId,
              context.accountId,
            ),
          ),
        )
        .limit(1);

    if (!contact) {
      return NextResponse.json(
        {
          error:
            "Contact not found",
        },
        { status: 404 },
      );
    }

    const body =
      (await request.json()) as {
        content_type?:
          string;

        content_text?:
          string | null;

        media_url?:
          string | null;

        media_type?:
          string | null;

        filename?:
          string | null;

        template_name?:
          string | null;

        template_language?:
          string | null;

        template_params?:
          string[];

        reply_to_message_id?:
          string | null;

        interactive_payload?:
          MessagingInteractivePayload | null;
      };

    const contentType =
      body.content_type ??
      "text";

    if (
      !isContentType(
        contentType,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid content_type",
        },
        { status: 400 },
      );
    }

    if (
      !isProviderContentType(
        contentType,
      )
    ) {
      return NextResponse.json(
        {
          error:
            `O tipo ${contentType} ainda não está habilitado no dispatcher.`,
        },
        { status: 400 },
      );
    }

    const contentText =
      body.content_text
        ?.trim() ||
      null;

    if (
      contentType ===
        "text" &&
      !contentText
    ) {
      return NextResponse.json(
        {
          error:
            "content_text is required for text messages",
        },
        { status: 400 },
      );
    }

    let replyToProviderMessageId:
      string | null = null;

    if (
      body.reply_to_message_id
    ) {
      const [replyMessage] =
        await db
          .select({
            id:
              messages.id,

            providerMessageId:
              messages.messageId,
          })
          .from(messages)
          .where(
            and(
              eq(
                messages.id,
                body.reply_to_message_id,
              ),
              eq(
                messages.conversationId,
                id,
              ),
            ),
          )
          .limit(1);

      if (!replyMessage) {
        return NextResponse.json(
          {
            error:
              "Reply message does not belong to this conversation",
          },
          { status: 400 },
        );
      }

      replyToProviderMessageId =
        replyMessage.providerMessageId;
    }

    const channel =
      await getDefaultServiceChannel(
        context.accountId,
      );

    if (!channel) {
      return NextResponse.json(
        {
          error:
            "Nenhum canal padrão de atendimento está configurado para esta conta.",
        },
        { status: 409 },
      );
    }

    const provider =
      getMessagingProvider(
        channel.provider,
      );

    const now =
      new Date();

    const created =
      await db.transaction(
        async (tx) => {
          const [message] =
            await tx
              .insert(messages)
              .values({
                conversationId:
                  id,

                senderType:
                  "agent",

                senderId:
                  context.userId,

                contentType,

                contentText,

                mediaUrl:
                  body.media_url ??
                  null,

                mediaType:
                  body.media_type ??
                  null,

                templateName:
                  body.template_name ??
                  null,

                status:
                  "sending",

                provider:
                  channel.provider,

                messagingChannelId:
                  channel.id,

                transportError:
                  null,

                replyToMessageId:
                  body.reply_to_message_id ??
                  null,

                interactivePayload:
                  body.interactive_payload ??
                  null,

                aiGenerated:
                  false,

                createdAt:
                  now,
              })
              .returning();

          const preview =
            contentText ??
            `[${contentType}]`;

          await tx
            .update(
              conversations,
            )
            .set({
              lastMessageText:
                preview,

              lastMessageAt:
                now,

              updatedAt:
                now,
            })
            .where(
              and(
                eq(
                  conversations.id,
                  id,
                ),
                eq(
                  conversations.accountId,
                  context.accountId,
                ),
              ),
            );

          return message;
        },
      );

    try {
      const result =
        await provider.send(
          {
            to:
              contact.phoneNormalized ||
              contact.phone,

            contentType,

            purpose:
              "service",

            mode:
              "single",

            text:
              contentText,

            mediaUrl:
              body.media_url ??
              null,

            filename:
              body.filename ??
              null,

            templateName:
              body.template_name ??
              null,

            templateLanguage:
              body.template_language ??
              null,

            templateParams:
              body.template_params,

            interactive:
              body.interactive_payload ??
              null,

            replyToProviderMessageId,
          },

          channel.config,
        );

      const [sent] =
        await db
          .update(messages)
          .set({
            status:
              "sent",

            messageId:
              result.providerMessageId,

            transportError:
              null,
          })
          .where(
            eq(
              messages.id,
              created.id,
            ),
          )
          .returning();

      return NextResponse.json(
        {
          item: {
            id:
              sent.id,

            conversation_id:
              sent.conversationId,

            direction:
              "outbound",

            sender_type:
              sent.senderType,

            content_type:
              sent.contentType,

            content_text:
              sent.contentText,

            provider:
              sent.provider,

            messaging_channel_id:
              sent.messagingChannelId,

            message_id:
              sent.messageId,

            status:
              sent.status,

            created_at:
              sent.createdAt,
          },

          transport_pending:
            false,
        },
        { status: 201 },
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Falha no provider de mensageria.";

      await db
        .update(messages)
        .set({
          status:
            "failed",

          transportError:
            message,
        })
        .where(
          eq(
            messages.id,
            created.id,
          ),
        );

      const status =
        error instanceof
        MessagingProviderError
          ? error.status
          : 502;

      console.error(
        "[messaging dispatcher]",
        {
          provider:
            channel.provider,

          channelId:
            channel.id,

          messageId:
            created.id,

          error:
            message,
        },
      );

      return NextResponse.json(
        {
          error:
            message,

          item: {
            id:
              created.id,

            conversation_id:
              created.conversationId,

            provider:
              channel.provider,

            messaging_channel_id:
              channel.id,

            status:
              "failed",
          },
        },
        { status },
      );
    }
  } catch (error) {
    return errorResponse(
      error,
    );
  }
}
