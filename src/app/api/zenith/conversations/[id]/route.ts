import { NextResponse } from "next/server";
import {
  and,
  eq,
} from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  accountMembers,
  contacts,
  conversations,
} from "@/lib/db/schema";
import {
  getZenithAccountContext,
  requireZenithRole,
} from "@/lib/auth/zenith-account";

const statuses = [
  "open",
  "pending",
  "closed",
] as const;

type Status =
  (typeof statuses)[number];

function isStatus(
  value: unknown,
): value is Status {
  return (
    typeof value === "string" &&
    statuses.includes(
      value as Status,
    )
  );
}

function errorResponse(error: unknown) {
  console.error(
    "[zenith conversation id]",
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

export async function GET(
  _request: Request,
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

    const [row] = await db
      .select({
        conversation:
          conversations,
        contact: contacts,
      })
      .from(conversations)
      .innerJoin(
        contacts,
        eq(
          contacts.id,
          conversations.contactId,
        ),
      )
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
          eq(
            contacts.accountId,
            context.accountId,
          ),
        ),
      )
      .limit(1);

    if (!row) {
      return NextResponse.json(
        {
          error:
            "Conversation not found",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      item: {
        id:
          row.conversation.id,
        account_id:
          row.conversation.accountId,
        contact_id:
          row.conversation.contactId,
        status:
          row.conversation.status,
        assigned_agent_id:
          row.conversation.assignedAgentId,
        last_message_text:
          row.conversation.lastMessageText,
        last_message_at:
          row.conversation.lastMessageAt,
        unread_count:
          row.conversation.unreadCount,
        ai_autoreply_disabled:
          row.conversation.aiAutoreplyDisabled,
        ai_reply_count:
          row.conversation.aiReplyCount,
        ai_handoff_summary:
          row.conversation.aiHandoffSummary,
        created_at:
          row.conversation.createdAt,
        updated_at:
          row.conversation.updatedAt,

        contact: {
          id: row.contact.id,
          phone:
            row.contact.phone,
          name:
            row.contact.name,
          email:
            row.contact.email,
          company:
            row.contact.company,
          avatar_url:
            row.contact.avatarUrl,
        },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
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

    const [current] = await db
      .select()
      .from(conversations)
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
      )
      .limit(1);

    if (!current) {
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
        status?: string;
        assigned_agent_id?:
          | string
          | null;
        unread_count?: number;
        ai_autoreply_disabled?:
          boolean;
      };

    if (
      body.status !== undefined &&
      !isStatus(body.status)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid conversation status",
        },
        { status: 400 },
      );
    }

    if (
      body.assigned_agent_id
    ) {
      const [member] =
        await db
          .select({
            userId:
              accountMembers.userId,
          })
          .from(accountMembers)
          .where(
            and(
              eq(
                accountMembers.accountId,
                context.accountId,
              ),
              eq(
                accountMembers.userId,
                body.assigned_agent_id,
              ),
            ),
          )
          .limit(1);

      if (!member) {
        return NextResponse.json(
          {
            error:
              "Assigned agent does not belong to this account",
          },
          { status: 400 },
        );
      }
    }

    const update: {
      status?: Status;
      assignedAgentId?:
        string | null;
      unreadCount?: number;
      aiAutoreplyDisabled?:
        boolean;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (
      body.status !== undefined
    ) {
      update.status =
        body.status;
    }

    if (
      body.assigned_agent_id !==
      undefined
    ) {
      update.assignedAgentId =
        body.assigned_agent_id;
    }

    if (
      body.unread_count !==
      undefined
    ) {
      update.unreadCount =
        Math.max(
          0,
          Math.floor(
            body.unread_count,
          ),
        );
    }

    if (
      body.ai_autoreply_disabled !==
      undefined
    ) {
      update.aiAutoreplyDisabled =
        body.ai_autoreply_disabled;
    }

    const [updated] = await db
      .update(conversations)
      .set(update)
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
      )
      .returning();

    return NextResponse.json({
      item: {
        id: updated.id,
        account_id:
          updated.accountId,
        contact_id:
          updated.contactId,
        status:
          updated.status,
        assigned_agent_id:
          updated.assignedAgentId,
        last_message_text:
          updated.lastMessageText,
        last_message_at:
          updated.lastMessageAt,
        unread_count:
          updated.unreadCount,
        ai_autoreply_disabled:
          updated.aiAutoreplyDisabled,
        updated_at:
          updated.updatedAt,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
