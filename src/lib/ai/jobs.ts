import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { aiAgents, aiAgentVersions, aiJobs } from "@/lib/db/schema";

export async function enqueueAiReply(
  tx: Pick<typeof db, "select" | "insert">,
  args: {
    accountId: string;
    conversationId: string;
    contactId: string;
    sourceMessageId: string;
  },
) {
  const [agent] = await tx.select({
    id: aiAgents.id,
    channels: aiAgentVersions.authorizedChannels,
  }).from(aiAgents).innerJoin(aiAgentVersions, and(
    eq(aiAgentVersions.agentId, aiAgents.id),
    eq(aiAgentVersions.accountId, aiAgents.accountId),
    eq(aiAgentVersions.version, aiAgents.currentVersion),
  )).where(and(eq(aiAgents.accountId, args.accountId), eq(aiAgents.status, "active"))).limit(1);
  if (!agent || !agent.channels.includes("whatsapp")) return null;
  const [job] = await tx.insert(aiJobs).values({
    accountId: args.accountId,
    type: "generate_reply",
    idempotencyKey: `reply:${args.sourceMessageId}`,
    payload: {
      conversationId: args.conversationId,
      contactId: args.contactId,
      sourceMessageId: args.sourceMessageId,
    },
  }).onConflictDoNothing({
    target: [aiJobs.accountId, aiJobs.idempotencyKey],
  }).returning();
  return job ?? null;
}

export async function enqueueDocumentIngestion(
  tx: Pick<typeof db, "insert">,
  args: { accountId: string; documentId: string; documentVersionId: string },
) {
  const [job] = await tx.insert(aiJobs).values({
    accountId: args.accountId,
    type: "ingest_document",
    idempotencyKey: `ingest:${args.documentVersionId}`,
    payload: args,
  }).onConflictDoNothing({
    target: [aiJobs.accountId, aiJobs.idempotencyKey],
  }).returning();
  return job ?? null;
}

export async function claimNextAiJob(now = new Date()) {
  const nowIso = now.toISOString();
  const leaseIso = new Date(now.getTime() + 90_000).toISOString();
  return db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      WITH candidate AS (
        SELECT id
        FROM ai_jobs
        WHERE next_attempt_at <= ${nowIso}::timestamptz
          AND (
            status = 'queued'
            OR (status = 'processing' AND lease_expires_at <= ${nowIso}::timestamptz)
          )
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE ai_jobs AS job
      SET status = 'processing',
          attempts = job.attempts + 1,
          lease_expires_at = ${leaseIso}::timestamptz,
          updated_at = ${nowIso}::timestamptz
      FROM candidate
      WHERE job.id = candidate.id
      RETURNING job.*
    `);
    return (rows as unknown as Array<typeof aiJobs.$inferSelect>)[0] ?? null;
  });
}

export async function completeAiJob(accountId: string, jobId: string) {
  await db.update(aiJobs).set({
    status: "completed",
    leaseExpiresAt: null,
    lastErrorCode: null,
    updatedAt: new Date(),
  }).where(and(eq(aiJobs.id, jobId), eq(aiJobs.accountId, accountId)));
}

export async function failAiJob(
  job: typeof aiJobs.$inferSelect,
  errorCode: string,
) {
  const terminal = job.attempts >= job.maxAttempts;
  await db.update(aiJobs).set({
    status: terminal ? "failed" : "queued",
    leaseExpiresAt: null,
    lastErrorCode: errorCode.slice(0, 120),
    nextAttemptAt: new Date(Date.now() + Math.min(60_000, 2 ** job.attempts * 1_000)),
    updatedAt: new Date(),
  }).where(and(eq(aiJobs.id, job.id), eq(aiJobs.accountId, job.accountId)));
}
