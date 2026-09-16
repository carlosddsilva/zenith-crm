import { NextResponse } from "next/server";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
} from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  accountMembers,
  contacts,
  contactTags,
  conversations,
  tags,
} from "@/lib/db/schema";
import {
  getZenithAccountContext,
  requireZenithRole,
} from "@/lib/auth/zenith-account";

const conversationStatuses = [
  "open",
  "pending",
  "closed",
] as const;

type ConversationStatus =
  (typeof conversationStatuses)[number];

function isConversationStatus(
  value: unknown,
): value is ConversationStatus {
  return (
    typeof value === "string" &&
    conversationStatuses.includes(
      value as ConversationStatus,
    )
  );
}

function errorResponse(error: unknown) {
  console.error(
    "[zenith conversations]",
    {
      errorCode: error instanceof Error ? error.name : "UnknownError",
    },
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

async function loadTags(
  contactIds: string[],
) {
  if (contactIds.length === 0) {
    return new Map<
      string,
      Array<{
        id: string;
        name: string;
        color: string;
      }>
    >();
  }

  const rows = await db
    .select({
      contactId: contactTags.contactId,
      id: tags.id,
      name: tags.name,
      color: tags.color,
    })
    .from(contactTags)
    .innerJoin(
      tags,
      eq(contactTags.tagId, tags.id),
    )
    .where(
      inArray(
        contactTags.contactId,
        contactIds,
      ),
    )
    .orderBy(asc(tags.name));

  const map = new Map<
    string,
    Array<{
      id: string;
      name: string;
      color: string;
    }>
  >();

  for (const row of rows) {
    const current =
      map.get(row.contactId) ?? [];

    current.push({
      id: row.id,
      name: row.name,
      color: row.color,
    });

    map.set(
      row.contactId,
      current,
    );
  }

  return map;
}

export async function GET(
  request: Request,
) {
  try {
    const context =
      await getZenithAccountContext();

    const url = new URL(request.url);

    const requestedPage =
      Number(
        url.searchParams.get("page") ?? "1",
      );

    const requestedPageSize =
      Number(
        url.searchParams.get("pageSize") ??
          "25",
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
            100,
          )
        : 25;

    const status =
      url.searchParams.get("status");

    const contactId =
      url.searchParams.get("contactId") ??
      url.searchParams.get("contact_id");

    const slaStatus =
      url.searchParams.get("slaStatus");

    const conditions = [
      eq(
        conversations.accountId,
        context.accountId,
      ),
    ];

    if (status) {
      if (!isConversationStatus(status)) {
        return NextResponse.json(
          {
            error:
              "Invalid conversation status",
          },
          { status: 400 },
        );
      }

      conditions.push(
        eq(
          conversations.status,
          status,
        ),
      );
    }

    if (contactId) {
      conditions.push(
        eq(
          conversations.contactId,
          contactId,
        ),
      );
    }

    if (slaStatus) {
      const statuses = slaStatus.split(",").map(s => s.trim()) as any[];
      conditions.push(
        inArray(
          conversations.slaStatus,
          statuses,
        ),
      );
    }

    const where =
      and(...conditions);

    const [totalRow] = await db
      .select({
        total: count(),
      })
      .from(conversations)
      .where(where);

    const rows = await db
      .select({
        id: conversations.id,
        accountId:
          conversations.accountId,
        contactId:
          conversations.contactId,
        status:
          conversations.status,
        assignedAgentId:
          conversations.assignedAgentId,
        lastMessageText:
          conversations.lastMessageText,
        lastMessageAt:
          conversations.lastMessageAt,
        unreadCount:
          conversations.unreadCount,
        aiAutoreplyDisabled:
          conversations.aiAutoreplyDisabled,
        aiReplyCount:
          conversations.aiReplyCount,
        aiHandoffSummary:
          conversations.aiHandoffSummary,
        firstUnrepliedMessageAt:
          conversations.firstUnrepliedMessageAt,
        slaStatus:
          conversations.slaStatus,
        createdAt:
          conversations.createdAt,
        updatedAt:
          conversations.updatedAt,

        contactPhone:
          contacts.phone,
        contactName:
          contacts.name,
        contactEmail:
          contacts.email,
        contactCompany:
          contacts.company,
        contactAvatarUrl:
          contacts.avatarUrl,
      })
      .from(conversations)
      .innerJoin(
        contacts,
        and(
          eq(
            contacts.id,
            conversations.contactId,
          ),
          eq(
            contacts.accountId,
            context.accountId,
          ),
        ),
      )
      .where(where)
      .orderBy(
        desc(
          conversations.lastMessageAt,
        ),
        desc(conversations.createdAt),
      )
      .limit(pageSize)
      .offset(
        (page - 1) * pageSize,
      );

    const tagsByContact =
      await loadTags(
        rows.map(
          (row) => row.contactId,
        ),
      );

    return NextResponse.json({
      items: rows.map((row) => ({
        id: row.id,
        account_id: row.accountId,
        contact_id: row.contactId,
        status: row.status,
        assigned_agent_id:
          row.assignedAgentId,
        last_message_text:
          row.lastMessageText,
        last_message_at:
          row.lastMessageAt,
        unread_count:
          row.unreadCount,
        ai_autoreply_disabled:
          row.aiAutoreplyDisabled,
        ai_reply_count:
          row.aiReplyCount,
        ai_handoff_summary:
          row.aiHandoffSummary,
        first_unreplied_message_at:
          row.firstUnrepliedMessageAt,
        sla_status:
          row.slaStatus,
        created_at:
          row.createdAt,
        updated_at:
          row.updatedAt,

        contact: {
          id: row.contactId,
          phone:
            row.contactPhone,
          name:
            row.contactName,
          email:
            row.contactEmail,
          company:
            row.contactCompany,
          avatar_url:
            row.contactAvatarUrl,
          tags:
            tagsByContact.get(
              row.contactId,
            ) ?? [],
        },
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

export async function POST(
  request: Request,
) {
  try {
    const context =
      await requireZenithRole("agent");

    const body =
      (await request.json()) as {
        contact_id?: string;
        status?: string;
        assigned_agent_id?:
          | string
          | null;
      };

    if (!body.contact_id) {
      return NextResponse.json(
        {
          error:
            "contact_id is required",
        },
        { status: 400 },
      );
    }

    const status =
      body.status ?? "open";

    if (
      !isConversationStatus(status)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid conversation status",
        },
        { status: 400 },
      );
    }

    const [contact] = await db
      .select({
        id: contacts.id,
      })
      .from(contacts)
      .where(
        and(
          eq(
            contacts.id,
            body.contact_id,
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

    const [created] = await db
      .insert(conversations)
      .values({
        accountId:
          context.accountId,
        userId:
          context.userId,
        contactId:
          body.contact_id,
        status,
        assignedAgentId:
          body.assigned_agent_id ??
          null,
      })
      .onConflictDoNothing({
        target: [
          conversations.accountId,
          conversations.contactId,
        ],
      })
      .returning();

    if (created) {
      return NextResponse.json(
        {
          item: {
            id: created.id,
            account_id:
              created.accountId,
            contact_id:
              created.contactId,
            status:
              created.status,
            assigned_agent_id:
              created.assignedAgentId,
            last_message_text:
              created.lastMessageText,
            last_message_at:
              created.lastMessageAt,
            unread_count:
              created.unreadCount,
            created_at:
              created.createdAt,
            updated_at:
              created.updatedAt,
          },
        },
        { status: 201 },
      );
    }

    const [existing] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(
            conversations.accountId,
            context.accountId,
          ),
          eq(
            conversations.contactId,
            body.contact_id,
          ),
        ),
      )
      .limit(1);

    return NextResponse.json({
      item: {
        id: existing.id,
        account_id:
          existing.accountId,
        contact_id:
          existing.contactId,
        status:
          existing.status,
        assigned_agent_id:
          existing.assignedAgentId,
        last_message_text:
          existing.lastMessageText,
        last_message_at:
          existing.lastMessageAt,
        unread_count:
          existing.unreadCount,
        created_at:
          existing.createdAt,
        updated_at:
          existing.updatedAt,
      },
      existing: true,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
