import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { customFields } from "@/lib/db/schema";
import { requireZenithRole } from "@/lib/auth/zenith-account";

function errorResponse(error: unknown) {
  console.error("[zenith custom-field id]", error);

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

    const [current] = await db
      .select()
      .from(customFields)
      .where(
        and(
          eq(customFields.id, id),
          eq(
            customFields.accountId,
            context.accountId,
          ),
        ),
      )
      .limit(1);

    if (!current) {
      return NextResponse.json(
        { error: "Custom field not found" },
        { status: 404 },
      );
    }

    const body = (await request.json()) as {
      field_name?: string;
      field_type?: string;
      field_options?: Record<string, unknown> | null;
    };

    const fieldName =
      body.field_name !== undefined
        ? body.field_name.trim()
        : current.fieldName;

    const fieldType =
      body.field_type !== undefined
        ? body.field_type.trim()
        : current.fieldType;

    if (!fieldName) {
      return NextResponse.json(
        { error: "field_name is required" },
        { status: 400 },
      );
    }

    if (!fieldType) {
      return NextResponse.json(
        { error: "field_type is required" },
        { status: 400 },
      );
    }

    const [duplicate] = await db
      .select({ id: customFields.id })
      .from(customFields)
      .where(
        and(
          eq(
            customFields.accountId,
            context.accountId,
          ),
          eq(
            customFields.fieldName,
            fieldName,
          ),
          ne(customFields.id, id),
        ),
      )
      .limit(1);

    if (duplicate) {
      return NextResponse.json(
        {
          error:
            "Já existe um campo personalizado com este nome.",
        },
        { status: 409 },
      );
    }

    const [updated] = await db
      .update(customFields)
      .set({
        fieldName,
        fieldType,
        fieldOptions:
          body.field_options !== undefined
            ? body.field_options
            : current.fieldOptions,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(customFields.id, id),
          eq(
            customFields.accountId,
            context.accountId,
          ),
        ),
      )
      .returning();

    return NextResponse.json({
      item: {
        id: updated.id,
        account_id: updated.accountId,
        field_name: updated.fieldName,
        field_type: updated.fieldType,
        field_options: updated.fieldOptions,
        created_at: updated.createdAt,
        updated_at: updated.updatedAt,
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
      .delete(customFields)
      .where(
        and(
          eq(customFields.id, id),
          eq(
            customFields.accountId,
            context.accountId,
          ),
        ),
      )
      .returning({
        id: customFields.id,
      });

    if (!deleted) {
      return NextResponse.json(
        { error: "Custom field not found" },
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
