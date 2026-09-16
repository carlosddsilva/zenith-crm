import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  aiDocuments,
  aiDocumentVersions,
  aiKnowledgeChunks,
} from "@/lib/db/schema";
import { reconcileAiBudget, reserveAiBudget } from "./budget";
import { chunkText, estimateTokens } from "./chunk";
import { loadCurrentAgent, aiRequestTimeoutMs } from "./config";
import { calculateEmbeddingCostMicros } from "./cost";
import { embedTexts } from "./provider";

type IngestPayload = {
  documentId: string;
  documentVersionId: string;
};

function validPayload(payload: Record<string, unknown>): payload is Record<string, unknown> & IngestPayload {
  return typeof payload.documentId === "string" && typeof payload.documentVersionId === "string";
}

export async function processDocumentIngestion(
  accountId: string,
  payload: Record<string, unknown>,
) {
  if (!validPayload(payload)) throw new Error("invalid_ingest_payload");
  const [source] = await db.select({
    document: aiDocuments,
    version: aiDocumentVersions,
  }).from(aiDocuments).innerJoin(aiDocumentVersions, and(
    eq(aiDocumentVersions.id, payload.documentVersionId),
    eq(aiDocumentVersions.documentId, aiDocuments.id),
    eq(aiDocumentVersions.accountId, aiDocuments.accountId),
  )).where(and(
    eq(aiDocuments.id, payload.documentId),
    eq(aiDocuments.accountId, accountId),
  )).limit(1);
  if (!source || source.document.status === "removed") return "source_removed";

  await db.transaction(async (tx) => {
    await tx.update(aiDocuments).set({ status: "indexing", errorCode: null, updatedAt: new Date() }).where(and(
      eq(aiDocuments.id, source.document.id),
      eq(aiDocuments.accountId, accountId),
    ));
    await tx.update(aiDocumentVersions).set({ status: "indexing", errorCode: null }).where(and(
      eq(aiDocumentVersions.id, source.version.id),
      eq(aiDocumentVersions.accountId, accountId),
    ));
  });

  const texts = chunkText(source.version.content);
  const tokenEstimates = texts.map(estimateTokens);
  let embeddings: number[][] | null = null;
  let semanticError: string | null = null;
  const config = await loadCurrentAgent(accountId, false);

  if (config?.embeddingsApiKey && texts.length > 0) {
    const estimatedTokens = tokenEstimates.reduce((sum, value) => sum + value, 0);
    const reservedMicros = Math.max(1, calculateEmbeddingCostMicros(
      estimatedTokens,
      config.version.embeddingPriceMicrosPerMillion,
    ));
    const withinCallLimit = reservedMicros <= config.version.perCallLimitMicros;
    const reservation = withinCallLimit
      ? await reserveAiBudget({
          accountId,
          agentId: config.agent.id,
          agentVersionId: config.version.id,
          conversationId: null,
          sourceMessageId: null,
          kind: "embedding",
          idempotencyKey: `embedding:${source.version.id}`,
          controlGeneration: null,
          provider: config.version.embeddingsProvider,
          model: config.version.embeddingsModel,
          reservedMicros,
          monthlyLimitMicros: config.version.monthlyLimitMicros,
          maxConcurrency: config.version.maxConcurrency,
        })
      : { ok: false as const, code: "per_call_budget_exceeded" };

    if (reservation.ok && !reservation.replay) {
      const started = Date.now();
      try {
        const embedded = await embedTexts({
          apiKey: config.embeddingsApiKey,
          model: config.version.embeddingsModel,
          inputs: texts,
          timeoutMs: aiRequestTimeoutMs(),
        });
        embeddings = embedded.embeddings;
        const actualCost = embedded.usageTokens > 0
          ? calculateEmbeddingCostMicros(
              embedded.usageTokens,
              config.version.embeddingPriceMicrosPerMillion,
            )
          : null;
        await reconcileAiBudget({
          accountId,
          runId: reservation.run.id,
          status: "completed",
          actualCostMicros: actualCost,
          inputTokens: embedded.usageTokens || null,
          outputTokens: 0,
          durationMs: Date.now() - started,
          resultCode: "embedded",
        });
      } catch (error) {
        semanticError = error instanceof Error && "code" in error
          ? String((error as { code: unknown }).code)
          : "embedding_failed";
        await reconcileAiBudget({
          accountId,
          runId: reservation.run.id,
          status: "failed",
          actualCostMicros: null,
          inputTokens: null,
          outputTokens: null,
          durationMs: Date.now() - started,
          errorCode: semanticError,
        });
      }
    } else if (!reservation.ok) {
      semanticError = reservation.code;
    }
  } else {
    semanticError = "semantic_not_configured";
  }

  await db.transaction(async (tx) => {
    const [current] = await tx.select({
      status: aiDocuments.status,
      currentVersion: aiDocuments.currentVersion,
    }).from(aiDocuments).where(and(
      eq(aiDocuments.id, source.document.id),
      eq(aiDocuments.accountId, accountId),
    )).for("update").limit(1);
    if (!current || current.status === "removed" || current.currentVersion !== source.version.version) return;
    await tx.delete(aiKnowledgeChunks).where(and(
      eq(aiKnowledgeChunks.accountId, accountId),
      eq(aiKnowledgeChunks.documentVersionId, source.version.id),
    ));
    if (texts.length) {
      await tx.insert(aiKnowledgeChunks).values(texts.map((content, index) => ({
        accountId,
        documentId: source.document.id,
        documentVersionId: source.version.id,
        chunkIndex: index,
        content,
        tokenEstimate: tokenEstimates[index],
        embedding: embeddings?.[index] ?? null,
      })));
    }
    await tx.update(aiDocumentVersions).set({
      status: "ready",
      errorCode: semanticError,
    }).where(and(
      eq(aiDocumentVersions.id, source.version.id),
      eq(aiDocumentVersions.accountId, accountId),
    ));
    await tx.update(aiDocuments).set({
      status: "ready",
      errorCode: semanticError,
      updatedAt: new Date(),
    }).where(and(eq(aiDocuments.id, source.document.id), eq(aiDocuments.accountId, accountId)));
  });
  return semanticError ? "ready_lexical" : "ready_hybrid";
}
