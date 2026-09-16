import { NextResponse } from "next/server";
import {
  and,
  eq,
  ne,
} from "drizzle-orm";

import { db } from "@/lib/db/client";
import { tags } from "@/lib/db/schema";
import { requireZenithRole } from "@/lib/auth/zenith-account";

function errorResponse(error: unknown) {
  console.error("[zenith tag id]", {
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

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const context = await requireZenithRole("admin");
    const { id } = await params;

    const body = (await request.json()) as {
      name?: string;
      color?: string;
    };

    const [current] = await db
      .select({
        id: tags.id,
        name: tags.name,
        color: tags.color,
      })
      .from(tags)
      .where(
        and(
          eq(tags.id, id),
          eq(tags.accountId, context.accountId),
        ),
      )
      .limit(1);

    if (!current) {
      return NextResponse.json(
        { error: "Tag not found" },
        { status: 404 },
      );
    }

    const name =
      body.name !== undefined
        ? body.name.trim()
        : current.name;

    const color =
      body.color !== undefined
        ? body.color.trim()
        : current.color;

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 },
      );
    }

    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      return NextResponse.json(
        { error: "Invalid color" },
        { status: 400 },
      );
    }

    const [duplicate] = await db
      .select({
        id: tags.id,
      })
      .from(tags)
      .where(
        and(
          eq(tags.accountId, context.accountId),
          eq(tags.name, name),
          ne(tags.id, id),
        ),
      )
      .limit(1);

    if (duplicate) {
      return NextResponse.json(
        {
          error:
            "Já existe uma tag com este nome.",
        },
        { status: 409 },
      );
    }

    const [updated] = await db
      .update(tags)
      .set({
        name,
        color,
      })
      .where(
        and(
          eq(tags.id, id),
          eq(tags.accountId, context.accountId),
        ),
      )
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Tag not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      item: {
        id: updated.id,
        name: updated.name,
        color: updated.color,
        created_at: updated.createdAt,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const context = await requireZenithRole("admin");
    const { id } = await params;

    const [deleted] = await db
      .delete(tags)
      .where(
        and(
          eq(tags.id, id),
          eq(tags.accountId, context.accountId),
        ),
      )
      .returning({
        id: tags.id,
      });

    if (!deleted) {
      return NextResponse.json(
        { error: "Tag not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      id: deleted.id,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
