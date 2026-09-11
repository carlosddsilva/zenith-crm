import { NextResponse } from "next/server";
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  type SQL,
} from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  contacts,
  contactTags,
  tags,
} from "@/lib/db/schema";
import {
  getZenithAccountContext,
  requireZenithRole,
} from "@/lib/auth/zenith-account";
import { normalizePhone } from "@/lib/whatsapp/phone-utils";

function errorResponse(error: unknown) {
  console.error("[zenith contacts]", error);

  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  ) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Request failed",
      },
      {
        status: (error as { status: number }).status,
      },
    );
  }

  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error
      ? String((error as { code?: unknown }).code)
      : null;

  if (code === "23505") {
    return NextResponse.json(
      {
        error:
          "Já existe um contato com este telefone nesta conta.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const context = await getZenithAccountContext();

    const url = new URL(request.url);

    const page = Math.max(
      1,
      Number.parseInt(url.searchParams.get("page") ?? "1", 10),
    );

    const pageSize = Math.min(
      100,
      Math.max(
        1,
        Number.parseInt(
          url.searchParams.get("pageSize") ?? "25",
          10,
        ),
      ),
    );

    const search =
      url.searchParams.get("search")?.trim() ?? "";

    const tagId =
      url.searchParams.get("tagId")?.trim() ?? "";

    const conditions: SQL[] = [
      eq(contacts.accountId, context.accountId),
    ];

    if (search) {
      const pattern = `%${search}%`;

      const searchCondition = or(
        ilike(contacts.name, pattern),
        ilike(contacts.phone, pattern),
        ilike(contacts.email, pattern),
        ilike(contacts.company, pattern),
      );

      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    if (tagId) {
      const taggedContacts = await db
        .select({
          contactId: contactTags.contactId,
        })
        .from(contactTags)
        .innerJoin(
          tags,
          eq(tags.id, contactTags.tagId),
        )
        .innerJoin(
          contacts,
          eq(contacts.id, contactTags.contactId),
        )
        .where(
          and(
            eq(tags.id, tagId),
            eq(tags.accountId, context.accountId),
            eq(contacts.accountId, context.accountId),
          ),
        );

      const taggedIds = taggedContacts.map(
        (row) => row.contactId,
      );

      if (taggedIds.length === 0) {
        return NextResponse.json({
          items: [],
          pagination: {
            page,
            pageSize,
            total: 0,
          },
        });
      }

      conditions.push(
        inArray(contacts.id, taggedIds),
      );
    }

    const where = and(...conditions);

    const [totalRow] = await db
      .select({
        value: count(),
      })
      .from(contacts)
      .where(where);

    const total = totalRow?.value ?? 0;

    const rows = await db
      .select()
      .from(contacts)
      .where(where)
      .orderBy(desc(contacts.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const ids = rows.map((contact) => contact.id);

    const tagRows =
      ids.length > 0
        ? await db
            .select({
              contactId: contactTags.contactId,
              id: tags.id,
              name: tags.name,
              color: tags.color,
            })
            .from(contactTags)
            .innerJoin(
              tags,
              eq(tags.id, contactTags.tagId),
            )
            .where(
              and(
                inArray(contactTags.contactId, ids),
                eq(tags.accountId, context.accountId),
              ),
            )
        : [];

    const tagsByContact = new Map<
      string,
      Array<{
        id: string;
        name: string;
        color: string;
      }>
    >();

    for (const row of tagRows) {
      const current =
        tagsByContact.get(row.contactId) ?? [];

      current.push({
        id: row.id,
        name: row.name,
        color: row.color,
      });

      tagsByContact.set(row.contactId, current);
    }

    return NextResponse.json({
      items: rows.map((contact) => ({
        id: contact.id,
        user_id: contact.userId,
        account_id: contact.accountId,
        phone: contact.phone,
        phone_normalized: contact.phoneNormalized,
        name: contact.name,
        email: contact.email,
        company: contact.company,
        company_id: contact.companyId,
        avatar_url: contact.avatarUrl,
        created_at: contact.createdAt,
        updated_at: contact.updatedAt,
        tags: tagsByContact.get(contact.id) ?? [],
      })),
      pagination: {
        page,
        pageSize,
        total,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireZenithRole("agent");

    const body = (await request.json()) as {
      name?: string | null;
      phone?: string;
      email?: string | null;
      company?: string | null;
      company_id?: string | null;
      avatar_url?: string | null;
    };

    const phone = body.phone?.trim() ?? "";
    const normalized = normalizePhone(phone);

    if (!phone || !normalized) {
      return NextResponse.json(
        { error: "Phone is required" },
        { status: 400 },
      );
    }

    const [contact] = await db
      .insert(contacts)
      .values({
        accountId: context.accountId,
        userId: context.userId,
        phone,
        phoneNormalized: normalized,
        name: body.name?.trim() || null,
        email: body.email?.trim() || null,
        company: body.company?.trim() || null,
        companyId: body.company_id || null,
        avatarUrl:
          body.avatar_url?.trim() || null,
      })
      .returning();

    // Publish Automation Events
    try {
      const { publishEvent } = await import('@/lib/events/bus');
      publishEvent({
        accountId: context.accountId,
        triggerType: 'contact.created',
        entityType: 'contact',
        entityId: contact.id,
        payload: { contact },
      });
    } catch (evtErr) {
      console.error('[EventBus] Failed to publish contact.created:', evtErr);
    }

    return NextResponse.json(
      {
        item: {
          id: contact.id,
          user_id: contact.userId,
          account_id: contact.accountId,
          phone: contact.phone,
          phone_normalized:
            contact.phoneNormalized,
          name: contact.name,
          email: contact.email,
          company: contact.company,
          company_id: contact.companyId,
          avatar_url: contact.avatarUrl,
          created_at: contact.createdAt,
          updated_at: contact.updatedAt,
          tags: [],
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
