import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { contacts } from "@/lib/db/schema";
import {
  getZenithAccountContext,
  requireZenithRole,
} from "@/lib/auth/zenith-account";
import { normalizePhone } from "@/lib/whatsapp/phone-utils";

function contactResponse(contact: typeof contacts.$inferSelect) {
  return {
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
  };
}

function errorResponse(error: unknown) {
  console.error("[zenith contacts id]", error);

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

    const [contact] = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.id, id),
          eq(contacts.accountId, context.accountId),
        ),
      )
      .limit(1);

    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      item: contactResponse(contact),
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
    params: Promise<{ id: string }>;
  },
) {
  try {
    const context = await requireZenithRole("agent");
    const { id } = await params;

    const body = (await request.json()) as {
      name?: string | null;
      phone?: string;
      email?: string | null;
      company?: string | null;
      company_id?: string | null;
      avatar_url?: string | null;
    };

    const update: Partial<typeof contacts.$inferInsert> = {
      updatedAt: new Date(),
    };

    if ("name" in body) {
      update.name = body.name?.trim() || null;
    }

    if ("email" in body) {
      update.email = body.email?.trim() || null;
    }

    if ("company" in body) {
      update.company = body.company?.trim() || null;
    }

    if ("company_id" in body) {
      update.companyId = body.company_id || null;
    }

    if ("avatar_url" in body) {
      update.avatarUrl = body.avatar_url?.trim() || null;
    }

    if ("phone" in body) {
      const phone = body.phone?.trim() ?? "";
      const normalized = normalizePhone(phone);

      if (!phone || !normalized) {
        return NextResponse.json(
          { error: "Phone is required" },
          { status: 400 },
        );
      }

      update.phone = phone;
      update.phoneNormalized = normalized;
    }

    const [contact] = await db
      .update(contacts)
      .set(update)
      .where(
        and(
          eq(contacts.id, id),
          eq(contacts.accountId, context.accountId),
        ),
      )
      .returning();

    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      item: contactResponse(contact),
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
    const context = await requireZenithRole("agent");
    const { id } = await params;

    const [deleted] = await db
      .delete(contacts)
      .where(
        and(
          eq(contacts.id, id),
          eq(contacts.accountId, context.accountId),
        ),
      )
      .returning({
        id: contacts.id,
      });

    if (!deleted) {
      return NextResponse.json(
        { error: "Contact not found" },
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
