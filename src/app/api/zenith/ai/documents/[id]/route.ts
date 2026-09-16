import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { apiErrorResponse } from "@/lib/api/error-response";
import { logAuditAction } from "@/lib/audit/logger";
import { requireZenithRole } from "@/lib/auth/zenith-account";
import { db } from "@/lib/db/client";
import { aiDocuments, aiDocumentVersions } from "@/lib/db/schema";
import { enqueueDocumentIngestion } from "@/lib/ai/jobs";
import { documentInputSchema, validateDocumentContent } from "@/lib/ai/validation";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireZenithRole("admin");
    const { id } = await context.params;
    const parsed = documentInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const validation = validateDocumentContent(parsed.data.content);
    if (!validation.ok) return Response.json({ error: validation.code }, { status: 400 });
    const result = await db.transaction(async (tx) => {
      const [document] = await tx.select().from(aiDocuments).where(and(
        eq(aiDocuments.id, id),
        eq(aiDocuments.accountId, actor.accountId),
      )).for("update").limit(1);
      if (!document || document.status === "removed") return null;
      const nextVersion = document.currentVersion + 1;
      const [version] = await tx.insert(aiDocumentVersions).values({
        accountId: actor.accountId,
        documentId: document.id,
        version: nextVersion,
        content: parsed.data.content,
        contentSha256: createHash("sha256").update(parsed.data.content).digest("hex"),
        byteSize: validation.bytes,
      }).returning();
      await tx.update(aiDocuments).set({
        title: parsed.data.title,
        mimeType: parsed.data.mimeType,
        currentVersion: nextVersion,
        status: "queued",
        errorCode: null,
        updatedAt: new Date(),
      }).where(and(eq(aiDocuments.id, id), eq(aiDocuments.accountId, actor.accountId)));
      const job = await enqueueDocumentIngestion(tx, {
        accountId: actor.accountId,
        documentId: document.id,
        documentVersionId: version.id,
      });
      return { version, jobId: job?.id ?? null };
    });
    if (!result) return Response.json({ error: "Not found" }, { status: 404 });
    await logAuditAction({ context: actor, action: "AI_SOURCE_INGEST", entityType: "AI_DOCUMENT", entityId: id, metadata: { version: result.version.version, mimeType: parsed.data.mimeType, byteSize: validation.bytes } });
    return Response.json(result, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error, "[PUT /api/zenith/ai/documents/:id]");
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireZenithRole("admin");
    const { accountId } = actor;
    const { id } = await context.params;
    const [removed] = await db.transaction(async (tx) => {
      const result = await tx.update(aiDocuments).set({
        status: "removed",
        removedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(eq(aiDocuments.id, id), eq(aiDocuments.accountId, accountId))).returning();
      await tx.update(aiDocumentVersions).set({ status: "removed" }).where(and(
        eq(aiDocumentVersions.documentId, id),
        eq(aiDocumentVersions.accountId, accountId),
      ));
      return result;
    });
    if (!removed) return Response.json({ error: "Not found" }, { status: 404 });
    await logAuditAction({ context: actor, action: "AI_SOURCE_REMOVE", entityType: "AI_DOCUMENT", entityId: id });
    return Response.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "[DELETE /api/zenith/ai/documents/:id]");
  }
}
