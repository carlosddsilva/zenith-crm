import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { tags } from "@/lib/db/schema";
import {
  getZenithAccountContext,
  requireZenithRole,
} from "@/lib/auth/zenith-account";

function errorResponse(error: unknown) {
  console.error("[zenith tags]", {
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

export async function GET() {
  try {
    const context = await getZenithAccountContext();

    const items = await db
      .select({
        id: tags.id,
        name: tags.name,
        color: tags.color,
        createdAt: tags.createdAt,
      })
      .from(tags)
      .where(eq(tags.accountId, context.accountId))
      .orderBy(asc(tags.name));

    return NextResponse.json({
      items: items.map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        created_at: tag.createdAt,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireZenithRole("agent");

    const body = (await request.json()) as {
      name?: string;
      color?: string;
    };

    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 },
      );
    }

    const [existing] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(
        and(
          eq(tags.accountId, context.accountId),
          eq(tags.name, name),
        ),
      )
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: "Já existe uma tag com este nome." },
        { status: 409 },
      );
    }

    const [tag] = await db
      .insert(tags)
      .values({
        accountId: context.accountId,
        userId: context.userId,
        name,
        color: body.color?.trim() || "#3b82f6",
      })
      .returning();

    return NextResponse.json(
      {
        item: {
          id: tag.id,
          name: tag.name,
          color: tag.color,
          created_at: tag.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

