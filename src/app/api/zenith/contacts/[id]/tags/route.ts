import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

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

async function validateContact(
  contactId: string,
  accountId: string,
) {
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.id, contactId),
        eq(contacts.accountId, accountId),
      ),
    )
    .limit(1);

  return contact;
}

function errorResponse(error: unknown) {
  console.error("[zenith contact tags]", {
    errorCode: error instanceof Error ? error.name : "UnknownError",
  });

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
    params: Promise<{ id: string }>;
  },
) {
  try {
    const context = await getZenithAccountContext();
    const { id } = await params;

    const contact = await validateContact(
      id,
      context.accountId,
    );

    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 },
      );
    }

    const items = await db
      .select({
        id: tags.id,
        name: tags.name,
        color: tags.color,
      })
      .from(contactTags)
      .innerJoin(
        tags,
        eq(tags.id, contactTags.tagId),
      )
      .where(eq(contactTags.contactId, id));

    return NextResponse.json({
      items,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const context = await requireZenithRole("agent");
    const { id } = await params;

    const body = (await request.json()) as {
      tag_id?: string;
    };

    if (!body.tag_id) {
      return NextResponse.json(
        { error: "tag_id is required" },
        { status: 400 },
      );
    }

    const contact = await validateContact(
      id,
      context.accountId,
    );

    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 },
      );
    }

    const [tag] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(
        and(
          eq(tags.id, body.tag_id),
          eq(tags.accountId, context.accountId),
        ),
      )
      .limit(1);

    if (!tag) {
      return NextResponse.json(
        { error: "Tag not found" },
        { status: 404 },
      );
    }

    const [existing] = await db
      .select({ id: contactTags.id })
      .from(contactTags)
      .where(
        and(
          eq(contactTags.contactId, id),
          eq(contactTags.tagId, tag.id),
        ),
      )
      .limit(1);

    if (!existing) {
      await db.insert(contactTags).values({
        contactId: id,
        tagId: tag.id,
      });
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const context = await requireZenithRole("agent");
    const { id } = await params;

    const body = (await request.json()) as {
      tag_id?: string;
    };

    if (!body.tag_id) {
      return NextResponse.json(
        { error: "tag_id is required" },
        { status: 400 },
      );
    }

    const contact = await validateContact(
      id,
      context.accountId,
    );

    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 },
      );
    }

    const [tag] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(
        and(
          eq(tags.id, body.tag_id),
          eq(tags.accountId, context.accountId),
        ),
      )
      .limit(1);

    if (!tag) {
      return NextResponse.json(
        { error: "Tag not found" },
        { status: 404 },
      );
    }

    await db
      .delete(contactTags)
      .where(
        and(
          eq(contactTags.contactId, id),
          eq(contactTags.tagId, tag.id),
        ),
      );

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
