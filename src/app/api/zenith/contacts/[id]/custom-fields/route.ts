import { NextResponse } from "next/server";
import {
  and,
  asc,
  eq,
  inArray,
} from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  contacts,
  contactCustomValues,
  customFields,
} from "@/lib/db/schema";
import {
  getZenithAccountContext,
  requireZenithRole,
} from "@/lib/auth/zenith-account";

async function getContact(
  id: string,
  accountId: string,
) {
  const [contact] = await db
    .select({
      id: contacts.id,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.id, id),
        eq(contacts.accountId, accountId),
      ),
    )
    .limit(1);

  return contact;
}

function errorResponse(error: unknown) {
  console.error(
    "[zenith contact custom-fields]",
    error,
  );

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
    const context =
      await getZenithAccountContext();

    const { id } = await params;

    const contact = await getContact(
      id,
      context.accountId,
    );

    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 },
      );
    }

    const fields = await db
      .select()
      .from(customFields)
      .where(
        eq(
          customFields.accountId,
          context.accountId,
        ),
      )
      .orderBy(
        asc(customFields.fieldName),
      );

    const values =
      fields.length > 0
        ? await db
            .select({
              customFieldId:
                contactCustomValues.customFieldId,
              value:
                contactCustomValues.value,
            })
            .from(contactCustomValues)
            .where(
              and(
                eq(
                  contactCustomValues.contactId,
                  id,
                ),
                inArray(
                  contactCustomValues.customFieldId,
                  fields.map(
                    (field) => field.id,
                  ),
                ),
              ),
            )
        : [];

    const valuesMap = new Map(
      values.map((row) => [
        row.customFieldId,
        row.value,
      ]),
    );

    return NextResponse.json({
      items: fields.map((field) => ({
        id: field.id,
        field_name: field.fieldName,
        field_type: field.fieldType,
        field_options: field.fieldOptions,
        value:
          valuesMap.get(field.id) ?? null,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const context =
      await requireZenithRole("agent");

    const { id } = await params;

    const contact = await getContact(
      id,
      context.accountId,
    );

    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 },
      );
    }

    const body = (await request.json()) as {
      values?: Record<
        string,
        string | number | boolean | null
      >;
    };

    if (
      !body.values ||
      typeof body.values !== "object" ||
      Array.isArray(body.values)
    ) {
      return NextResponse.json(
        { error: "values is required" },
        { status: 400 },
      );
    }

    const requestedIds =
      Object.keys(body.values);

    if (requestedIds.length === 0) {
      return NextResponse.json({
        ok: true,
      });
    }

    const allowedFields = await db
      .select({
        id: customFields.id,
      })
      .from(customFields)
      .where(
        and(
          eq(
            customFields.accountId,
            context.accountId,
          ),
          inArray(
            customFields.id,
            requestedIds,
          ),
        ),
      );

    const allowedIds = new Set(
      allowedFields.map(
        (field) => field.id,
      ),
    );

    if (
      allowedIds.size !==
      requestedIds.length
    ) {
      return NextResponse.json(
        {
          error:
            "Um ou mais campos personalizados não pertencem à conta atual.",
        },
        { status: 400 },
      );
    }

    await db.transaction(async (tx) => {
      for (const fieldId of requestedIds) {
        const rawValue =
          body.values?.[fieldId];

        if (
          rawValue === null ||
          rawValue === undefined ||
          rawValue === ""
        ) {
          await tx
            .delete(contactCustomValues)
            .where(
              and(
                eq(
                  contactCustomValues.contactId,
                  id,
                ),
                eq(
                  contactCustomValues.customFieldId,
                  fieldId,
                ),
              ),
            );

          continue;
        }

        const value = String(rawValue);

        await tx
          .insert(contactCustomValues)
          .values({
            contactId: id,
            customFieldId: fieldId,
            value,
          })
          .onConflictDoUpdate({
            target: [
              contactCustomValues.contactId,
              contactCustomValues.customFieldId,
            ],
            set: {
              value,
              updatedAt: new Date(),
            },
          });
      }
    });

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
