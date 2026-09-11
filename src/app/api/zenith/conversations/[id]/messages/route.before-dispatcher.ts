import { NextResponse } from "next/server";
import {
  and,
  count,
  desc,
  eq,
} from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  conversations,
  messages,
} from "@/lib/db/schema";
import {
  getZenithAccountContext,
  requireZenithRole,
} from "@/lib/auth/zenith-account";

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

function errorResponse(error: unknown) {
  console.error(
    "[zenith conversation messages]",
    error,
  );

  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status ===
      "number"
  ) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Request failed",
      },
      {
        status: (error as { status: number })
          .status,
      },
    );
  }

  return NextResponse.json(
    { error: "Internal server error" },
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

    const { id } = await params;

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

    const url = new URL(request.url);

    const requestedPage =
      Number(
        url.searchParams.get("page") ?? "1",
      );

    const requestedPageSize =
      Number(
        url.searchParams.get("pageSize") ??
          "100",
      );

    const page =
      Number.isFinite(requestedPage) &&
      requestedPage > 0
        ? Math.floor(requestedPage)
        : 1;

    const pageSize =
      Number.isFinite(requestedPageSize) &&
      requestedPageSize > 0
        ? Math.min(
            Math.floor(requestedPageSize),
            200,
          )
        : 100;

    const [totalRow] = await db
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

    const rows = await db
      .select()
      .from(messages)
      .where(
        eq(
          messages.conversationId,
          id,
        ),
      )
      .orderBy(
        desc(messages.createdAt),
        desc(messages.id),
      )
      .limit(pageSize)
      .offset(
        (page - 1) * pageSize,
      );

    return NextResponse.json({
      items: rows.map((message) => ({
        id: message.id,
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
      })),

      pagination: {
        page,
        pageSize,
        total:
          Number(
            totalRow?.total ?? 0,
          ),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/*
 * Importante:
 * este POST persiste a mensagem local.
 * Ele ainda NÃO envia para Meta/Evolution.
 */
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
      await requireZenithRole("agent");

    const { id } = await params;

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

    const body =
      (await request.json()) as {
        content_type?: string;
        content_text?:
          | string
          | null;
        media_url?:
          | string
          | null;
        media_type?:
          | string
          | null;
        template_name?:
          | string
          | null;
        reply_to_message_id?:
          | string
          | null;
        interactive_payload?:
          | Record<
              string,
              unknown
            >
          | null;
      };

    const contentType =
      body.content_type ??
      "text";

    if (
      !isContentType(contentType)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid content_type",
        },
        { status: 400 },
      );
    }

    const contentText =
      body.content_text?.trim() ||
      null;

    if (
      contentType === "text" &&
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

    if (
      body.reply_to_message_id
    ) {
      const [replyMessage] =
        await db
          .select({
            id: messages.id,
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
    }

    const now = new Date();

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
            .update(conversations)
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

    return NextResponse.json(
      {
        item: {
          id: created.id,
          conversation_id:
            created.conversationId,

          direction:
            "outbound",

          sender_type:
            created.senderType,

          sender_id:
            created.senderId,

          content_type:
            created.contentType,

          content_text:
            created.contentText,

          status:
            created.status,

          reply_to_message_id:
            created.replyToMessageId,

          created_at:
            created.createdAt,
        },

        transport_pending: true,
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

