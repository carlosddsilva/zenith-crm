import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { customFields } from "@/lib/db/schema";
import {
  getZenithAccountContext,
  requireZenithRole,
} from "@/lib/auth/zenith-account";

function errorResponse(error: unknown) {
  console.error("[zenith custom-fields]", error);

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
          "Já existe um campo personalizado com este nome.",
      },
      { status: 409 },
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
      .select()
      .from(customFields)
      .where(
        eq(
          customFields.accountId,
          context.accountId,
        ),
      )
      .orderBy(asc(customFields.fieldName));

    return NextResponse.json({
      items: items.map((field) => ({
        id: field.id,
        account_id: field.accountId,
        field_name: field.fieldName,
        field_type: field.fieldType,
        field_options: field.fieldOptions,
        created_at: field.createdAt,
        updated_at: field.updatedAt,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireZenithRole("admin");

    const body = (await request.json()) as {
      field_name?: string;
      field_type?: string;
      field_options?: Record<string, unknown> | null;
    };

    const fieldName =
      body.field_name?.trim() ?? "";

    const fieldType =
      body.field_type?.trim() || "text";

    if (!fieldName) {
      return NextResponse.json(
        { error: "field_name is required" },
        { status: 400 },
      );
    }

    const [created] = await db
      .insert(customFields)
      .values({
        accountId: context.accountId,
        userId: context.userId,
        fieldName,
        fieldType,
        fieldOptions:
          body.field_options ?? null,
      })
      .returning();

    return NextResponse.json(
      {
        item: {
          id: created.id,
          account_id: created.accountId,
          field_name: created.fieldName,
          field_type: created.fieldType,
          field_options: created.fieldOptions,
          created_at: created.createdAt,
          updated_at: created.updatedAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
