import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiMemories, contacts, notes, activities, contactTags, tags } from "@/lib/db/schema";
import { ZenithAccountContext } from "@/lib/auth/zenith-account";
import { logAuditAction } from "@/lib/audit/logger";

export async function exportContactData(context: ZenithAccountContext, contactId: string) {
  // 1. Fetch Contact
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.accountId, context.accountId)))
    .limit(1);

  if (!contact) {
    throw new Error("Contact not found or access denied.");
  }

  // 2. Fetch Tags
  const contactTagsList = await db
    .select({
      tagName: tags.name,
      createdAt: contactTags.createdAt,
    })
    .from(contactTags)
    .innerJoin(tags, eq(contactTags.tagId, tags.id))
    .where(and(
      eq(contactTags.contactId, contactId),
      eq(tags.accountId, context.accountId),
    ));

  // 3. Fetch Notes
  const contactNotes = await db
    .select({
      content: notes.content,
      createdAt: notes.createdAt,
    })
    .from(notes)
    .where(and(eq(notes.contactId, contactId), eq(notes.accountId, context.accountId)));

  // 4. Fetch Activities
  const contactActivities = await db
    .select({
      type: activities.type,
      metadata: activities.metadata,
      occurredAt: activities.occurredAt,
    })
    .from(activities)
    .where(and(eq(activities.contactId, contactId), eq(activities.accountId, context.accountId)));

  const aiMemory = await db
    .select({
      kind: aiMemories.kind,
      content: aiMemories.content,
      conversationId: aiMemories.conversationId,
      expiresAt: aiMemories.expiresAt,
      deletedAt: aiMemories.deletedAt,
      createdAt: aiMemories.createdAt,
    })
    .from(aiMemories)
    .where(and(
      eq(aiMemories.contactId, contactId),
      eq(aiMemories.accountId, context.accountId),
    ));

  // Combine
  const exportPayload = {
    contact: {
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      company: contact.company,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
      isBlocked: contact.isBlocked,
      optOut: contact.optOut,
      anonymizedAt: contact.anonymizedAt,
    },
    tags: contactTagsList,
    notes: contactNotes,
    activities: contactActivities,
    aiMemory,
    exportedAt: new Date().toISOString(),
    tenantId: context.accountId,
  };

  // 5. Audit Log
  await logAuditAction({
    context,
    action: "EXPORT",
    entityType: "CONTACT",
    entityId: contactId,
  });

  return exportPayload;
}
