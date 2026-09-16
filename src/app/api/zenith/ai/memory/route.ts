import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api/error-response";
import { logAuditAction } from "@/lib/audit/logger";
import { requireZenithRole } from "@/lib/auth/zenith-account";
import { loadCurrentAgent } from "@/lib/ai/config";
import { clearAiMemory } from "@/lib/ai/retrieval";
import { db } from "@/lib/db/client";
import { aiMemories, contacts, conversations } from "@/lib/db/schema";

const createSchema = z.object({
  contactId: z.string().uuid(),
  conversationId: z.string().uuid(),
  kind: z.enum(["preference", "summary", "business_context"]),
  content: z.string().trim().min(1).max(1_000),
});

export async function POST(request: Request) {
  try {
    const actor = await requireZenithRole("agent");
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const [scope, config] = await Promise.all([
      db.select({ id: conversations.id }).from(conversations).innerJoin(contacts, and(
        eq(contacts.id, conversations.contactId),
        eq(contacts.accountId, conversations.accountId),
      )).where(and(
        eq(conversations.id, parsed.data.conversationId),
        eq(conversations.accountId, actor.accountId),
        eq(contacts.id, parsed.data.contactId),
      )).limit(1),
      loadCurrentAgent(actor.accountId, false),
    ]);
    if (!scope[0]) return Response.json({ error: "Invalid tenant scope" }, { status: 404 });
    if (!config) return Response.json({ error: "AI agent not configured" }, { status: 409 });
    const [memory] = await db.insert(aiMemories).values({
      accountId: actor.accountId,
      contactId: parsed.data.contactId,
      conversationId: parsed.data.conversationId,
      kind: parsed.data.kind,
      content: parsed.data.content,
      expiresAt: new Date(Date.now() + config.version.memoryRetentionDays * 86_400_000),
    }).returning();
    return Response.json({ item: memory }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "[POST /api/zenith/ai/memory]");
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireZenithRole("admin");
    const contactId = new URL(request.url).searchParams.get("contactId");
    if (!contactId) return Response.json({ error: "contactId is required" }, { status: 400 });
    const [contact] = await db.select({ id: contacts.id }).from(contacts).where(and(
      eq(contacts.id, contactId),
      eq(contacts.accountId, actor.accountId),
    )).limit(1);
    if (!contact) return Response.json({ error: "Not found" }, { status: 404 });
    await clearAiMemory(actor.accountId, contactId);
    await logAuditAction({ context: actor, action: "AI_MEMORY_CLEAR", entityType: "CONTACT", entityId: contactId });
    return Response.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "[DELETE /api/zenith/ai/memory]");
  }
}
