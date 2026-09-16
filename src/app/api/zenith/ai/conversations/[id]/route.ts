import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api/error-response";
import { logAuditAction } from "@/lib/audit/logger";
import { requireZenithRole } from "@/lib/auth/zenith-account";
import { db } from "@/lib/db/client";
import { aiConversationControls, conversations } from "@/lib/db/schema";

const inputSchema = z.object({
  mode: z.enum(["active", "paused"]),
  assignToMe: z.boolean().default(false),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireZenithRole("agent");
    const { id } = await context.params;
    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const [conversation] = await db.select({ id: conversations.id }).from(conversations).where(and(
      eq(conversations.id, id),
      eq(conversations.accountId, actor.accountId),
    )).limit(1);
    if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });
    const active = parsed.data.mode === "active";
    await db.transaction(async (tx) => {
      await tx.insert(aiConversationControls).values({
        accountId: actor.accountId,
        conversationId: id,
        mode: parsed.data.mode,
        generation: 1,
        reasonCode: active ? "explicit_resume" : "human_takeover",
        changedByUserId: actor.userId,
      }).onConflictDoUpdate({
        target: aiConversationControls.conversationId,
        set: {
          mode: parsed.data.mode,
          generation: sql`${aiConversationControls.generation} + 1`,
          reasonCode: active ? "explicit_resume" : "human_takeover",
          changedByUserId: actor.userId,
          updatedAt: new Date(),
        },
      });
      await tx.update(conversations).set({
        aiAutoreplyDisabled: !active,
        assignedAgentId: active ? null : parsed.data.assignToMe ? actor.userId : undefined,
        aiReplyCount: active ? 0 : undefined,
        aiHandoffSummary: active ? null : undefined,
        updatedAt: new Date(),
      }).where(and(eq(conversations.id, id), eq(conversations.accountId, actor.accountId)));
    });
    await logAuditAction({
      context: actor,
      action: active ? "AI_RESUME" : "AI_PAUSE",
      entityType: "CONVERSATION",
      entityId: id,
      metadata: { assignToMe: parsed.data.assignToMe },
    });
    return Response.json({ success: true, mode: parsed.data.mode });
  } catch (error) {
    return apiErrorResponse(error, "[POST /api/zenith/ai/conversations/:id]");
  }
}
