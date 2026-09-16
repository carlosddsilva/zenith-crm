import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contacts } from "@/lib/db/schema";
import { requireZenithRole } from "@/lib/auth/zenith-account";
import { logAuditAction } from "@/lib/audit/logger";
import { anonymizeContact } from "@/lib/privacy/anonymize";
import { NextResponse } from "next/server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireZenithRole("admin");
    const { id } = await params;
    const body = await req.json();
    const { action } = body;

    // Verify contact exists
    const [contact] = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.accountId, context.accountId))).limit(1);

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    if (action === "anonymize") {
      const result = await anonymizeContact(context, id);
      return NextResponse.json(result);
    } 
    
    if (action === "block" || action === "unblock" || action === "opt_out" || action === "opt_in") {
      const isBlocked = action === "block" ? true : action === "unblock" ? false : contact.isBlocked;
      const optOut = action === "opt_out" ? true : action === "opt_in" ? false : contact.optOut;

      const [updated] = await db.update(contacts).set({ isBlocked, optOut }).where(eq(contacts.id, id)).returning();

      await logAuditAction({
        context,
        action: action.toUpperCase() as any,
        entityType: "CONTACT",
        entityId: id,
      });

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
