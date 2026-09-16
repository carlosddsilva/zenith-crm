import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";

import { apiErrorResponse } from "@/lib/api/error-response";
import { logAuditAction } from "@/lib/audit/logger";
import { requireZenithRole } from "@/lib/auth/zenith-account";
import { db } from "@/lib/db/client";
import { aiDocuments, aiDocumentVersions } from "@/lib/db/schema";
import { enqueueDocumentIngestion } from "@/lib/ai/jobs";
import { documentInputSchema, validateDocumentContent } from "@/lib/ai/validation";

export async function GET() {
  try {
    const { accountId } = await requireZenithRole("viewer");
    const items = await db.select().from(aiDocuments).where(eq(aiDocuments.accountId, accountId)).orderBy(desc(aiDocuments.updatedAt)).limit(200);
    return Response.json({ items });
  } catch (error) {
    return apiErrorResponse(error, "[GET /api/zenith/ai/documents]");
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireZenithRole("admin");
    const { accountId, userId } = context;
    const parsed = documentInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    const validation = validateDocumentContent(parsed.data.content);
    if (!validation.ok) return Response.json({ error: validation.code }, { status: 400 });
    const contentSha256 = createHash("sha256").update(parsed.data.content).digest("hex");
    const result = await db.transaction(async (tx) => {
      const [document] = await tx.insert(aiDocuments).values({
        accountId,
        title: parsed.data.title,
        mimeType: parsed.data.mimeType,
        createdByUserId: userId,
      }).returning();
      const [version] = await tx.insert(aiDocumentVersions).values({
        accountId,
        documentId: document.id,
        version: 1,
        content: parsed.data.content,
        contentSha256,
        byteSize: validation.bytes,
      }).returning();
      const job = await enqueueDocumentIngestion(tx, {
        accountId,
        documentId: document.id,
        documentVersionId: version.id,
      });
      return { document, versionId: version.id, jobId: job?.id ?? null };
    });
    await logAuditAction({ context, action: "AI_SOURCE_INGEST", entityType: "AI_DOCUMENT", entityId: result.document.id, metadata: { version: 1, mimeType: parsed.data.mimeType, byteSize: validation.bytes } });
    return Response.json(result, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error, "[POST /api/zenith/ai/documents]");
  }
}
