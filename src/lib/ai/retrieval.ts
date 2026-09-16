import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  aiDocuments,
  aiDocumentVersions,
  aiKnowledgeChunks,
  aiMemories,
} from "@/lib/db/schema";
import type { RetrievedSource } from "./types";

export async function retrieveAuthorizedKnowledge(args: {
  accountId: string;
  query: string;
  embedding?: number[] | null;
  limit?: number;
}) {
  const limit = Math.min(Math.max(args.limit ?? 5, 1), 10);
  const query = args.query.trim().slice(0, 4_000);
  if (!query) return [];

  const baseWhere = and(
    eq(aiKnowledgeChunks.accountId, args.accountId),
    eq(aiDocuments.accountId, args.accountId),
    eq(aiDocumentVersions.accountId, args.accountId),
    eq(aiDocuments.status, "ready"),
    eq(aiDocumentVersions.status, "ready"),
    eq(aiDocumentVersions.version, aiDocuments.currentVersion),
  );

  const selected = new Map<string, RetrievedSource>();
  if (args.embedding?.length === 1536) {
    const vectorLiteral = `[${args.embedding.join(",")}]`;
    const semantic = await db.select({
      chunkId: aiKnowledgeChunks.id,
      documentId: aiKnowledgeChunks.documentId,
      documentVersionId: aiKnowledgeChunks.documentVersionId,
      title: aiDocuments.title,
      content: aiKnowledgeChunks.content,
      score: sql<number>`1 - (${aiKnowledgeChunks.embedding} <=> ${vectorLiteral}::vector)`,
    }).from(aiKnowledgeChunks)
      .innerJoin(aiDocuments, eq(aiDocuments.id, aiKnowledgeChunks.documentId))
      .innerJoin(
        aiDocumentVersions,
        eq(aiDocumentVersions.id, aiKnowledgeChunks.documentVersionId),
      )
      .where(and(baseWhere, sql`${aiKnowledgeChunks.embedding} IS NOT NULL`))
      .orderBy(sql`${aiKnowledgeChunks.embedding} <=> ${vectorLiteral}::vector`)
      .limit(limit);
    for (const source of semantic) selected.set(source.chunkId, source);
  }

  if (selected.size < limit) {
    const lexical = await db.select({
      chunkId: aiKnowledgeChunks.id,
      documentId: aiKnowledgeChunks.documentId,
      documentVersionId: aiKnowledgeChunks.documentVersionId,
      title: aiDocuments.title,
      content: aiKnowledgeChunks.content,
      score: sql<number>`ts_rank_cd(to_tsvector('simple', ${aiKnowledgeChunks.content}), plainto_tsquery('simple', ${query}))`,
    }).from(aiKnowledgeChunks)
      .innerJoin(aiDocuments, eq(aiDocuments.id, aiKnowledgeChunks.documentId))
      .innerJoin(
        aiDocumentVersions,
        eq(aiDocumentVersions.id, aiKnowledgeChunks.documentVersionId),
      )
      .where(and(
        baseWhere,
        sql`to_tsvector('simple', ${aiKnowledgeChunks.content}) @@ plainto_tsquery('simple', ${query})`,
      ))
      .orderBy(sql`ts_rank_cd(to_tsvector('simple', ${aiKnowledgeChunks.content}), plainto_tsquery('simple', ${query})) DESC`)
      .limit(limit);
    for (const source of lexical) {
      if (selected.size >= limit) break;
      selected.set(source.chunkId, source);
    }
  }
  return [...selected.values()].slice(0, limit);
}

export async function loadActiveMemories(args: {
  accountId: string;
  contactId: string;
  conversationId: string;
  now?: Date;
  limit?: number;
}) {
  const now = args.now ?? new Date();
  return db.select({ content: aiMemories.content }).from(aiMemories).where(and(
    eq(aiMemories.accountId, args.accountId),
    eq(aiMemories.contactId, args.contactId),
    eq(aiMemories.conversationId, args.conversationId),
    isNull(aiMemories.deletedAt),
    gt(aiMemories.expiresAt, now),
  )).orderBy(sql`${aiMemories.createdAt} DESC`).limit(Math.min(args.limit ?? 10, 20));
}

export async function clearAiMemory(accountId: string, contactId: string) {
  return db.update(aiMemories).set({ deletedAt: new Date(), content: "[REDACTED]" }).where(and(
    eq(aiMemories.accountId, accountId),
    eq(aiMemories.contactId, contactId),
    isNull(aiMemories.deletedAt),
  ));
}
