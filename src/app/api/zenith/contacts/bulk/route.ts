import { NextResponse } from "next/server";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contacts } from "@/lib/db/schema";
import { requireZenithRole } from "@/lib/auth/zenith-account";
import { normalizePhone } from "@/lib/whatsapp/phone-utils";
import { normalizeKey } from "@/lib/contacts/dedupe";

export async function POST(request: Request) {
  try {
    const context = await requireZenithRole("agent");
    const body = (await request.json()) as {
      contacts: { phone: string; name?: string }[];
    };

    if (!body.contacts || !Array.isArray(body.contacts)) {
      return NextResponse.json({ error: "Invalid contacts array" }, { status: 400 });
    }

    const uniqueByKey = new Map<string, { phone: string; name?: string }>();
    for (const row of body.contacts) {
      const key = normalizeKey(row.phone);
      if (key && !uniqueByKey.has(key)) {
        uniqueByKey.set(key, { ...row, phone: normalizePhone(row.phone) || row.phone });
      }
    }
    const normalizedKeys = [...uniqueByKey.keys()];
    if (normalizedKeys.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const existing = await db
      .select({ id: contacts.id, phoneNormalized: contacts.phoneNormalized })
      .from(contacts)
      .where(
        and(eq(contacts.accountId, context.accountId), inArray(contacts.phoneNormalized, normalizedKeys))
      );

    const existingKeys = new Set(existing.map((c) => c.phoneNormalized));
    const byKey = new Map<string, string>();
    for (const c of existing) {
      if (c.phoneNormalized) byKey.set(c.phoneNormalized, c.id);
    }

    const missingRows = normalizedKeys
      .filter((k) => !existingKeys.has(k))
      .map((k) => {
        const item = uniqueByKey.get(k)!;
        return {
          accountId: context.accountId,
          userId: context.userId,
          phone: item.phone,
          phoneNormalized: k,
          name: item.name || null,
        };
      });

    if (missingRows.length > 0) {
      const INSERT_CHUNK = 200;
      for (let i = 0; i < missingRows.length; i += INSERT_CHUNK) {
        const chunk = missingRows.slice(i, i + INSERT_CHUNK);
        const inserted = await db.insert(contacts).values(chunk).returning({ id: contacts.id, phoneNormalized: contacts.phoneNormalized });
        for (const c of inserted) {
          if (c.phoneNormalized) byKey.set(c.phoneNormalized, c.id);
        }
      }
    }

    const resultIds = normalizedKeys
      .map((k) => byKey.get(k))
      .filter((id): id is string => Boolean(id));

    return NextResponse.json({ items: resultIds });
  } catch (error: any) {
    console.error("[api] contacts/bulk POST error:", error);
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
