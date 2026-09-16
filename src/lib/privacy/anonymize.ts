import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  aiMemories,
  callEvents,
  callParticipants,
  calls,
  contacts,
  notes,
} from "@/lib/db/schema";
import { ZenithAccountContext } from "@/lib/auth/zenith-account";
import { logAuditAction } from "@/lib/audit/logger";
import { randomUUID } from "crypto";

export async function anonymizeContact(context: ZenithAccountContext, contactId: string) {
  // We use a transaction to ensure all related redactions succeed or fail together.
  return await db.transaction(async (tx) => {
    // 1. Verify contact exists and belongs to tenant
    const [contact] = await tx
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.accountId, context.accountId)))
      .limit(1);

    if (!contact) {
      throw new Error("Contact not found or access denied.");
    }

    if (contact.anonymizedAt) {
      throw new Error("Contact is already anonymized.");
    }

    const redactHash = randomUUID();

    // 2. Anonymize the main contact record
    const [updated] = await tx
      .update(contacts)
      .set({
        name: "Anônimo",
        phone: `[REDACTED]-${redactHash.substring(0, 8)}`,
        phoneNormalized: `[REDACTED]-${redactHash.substring(0, 8)}`,
        email: null,
        company: null,
        avatarUrl: null,
        isBlocked: true,
        optOut: true,
        anonymizedAt: new Date(),
      })
      .where(eq(contacts.id, contactId))
      .returning();

    // 3. Redact notes which likely contain unstructured PII
    await tx
      .update(notes)
      .set({ content: "[REDACTED - LGPD]" })
      .where(and(eq(notes.contactId, contactId), eq(notes.accountId, context.accountId)));

    // AI memory is minimized and logically deleted with the contact. Keeping
    // the row (redacted) preserves budget/audit referential history without
    // retaining customer content.
    await tx
      .update(aiMemories)
      .set({ content: "[REDACTED - LGPD]", deletedAt: new Date() })
      .where(and(eq(aiMemories.contactId, contactId), eq(aiMemories.accountId, context.accountId)));

    // Voice lifecycle/provider IDs remain available so an active call can
    // still be cleaned up, while phone numbers and event payload PII are
    // removed from the CRM history.
    await tx
      .update(calls)
      .set({
        fromPhone: null,
        toPhone: null,
        updatedAt: new Date(),
      })
      .where(and(eq(calls.contactId, contactId), eq(calls.accountId, context.accountId)));

    await tx
      .update(callEvents)
      .set({ payload: null })
      .where(sql`
        exists (
          select 1
          from ${calls}
          where ${calls.id} = ${callEvents.callId}
            and ${calls.accountId} = ${context.accountId}
            and ${calls.contactId} = ${contactId}
        )
      `);

    await tx
      .update(callParticipants)
      .set({
        phone: null,
        displayName: "Anonimo",
        updatedAt: new Date(),
      })
      .where(and(
        eq(callParticipants.contactId, contactId),
        sql`
          exists (
            select 1
            from ${calls}
            where ${calls.id} = ${callParticipants.callId}
              and ${calls.accountId} = ${context.accountId}
          )
        `,
      ));

    // 4. Audit Log
    await logAuditAction({
      context,
      action: "ANONYMIZE",
      entityType: "CONTACT",
      entityId: contactId,
      metadata: {
        previousPhonePresent:
          Boolean(contact.phoneNormalized),
      },
    });

    return updated;
  });
}
