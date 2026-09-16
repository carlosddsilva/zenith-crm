import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db/client";
import {
  accounts,
  aiAgents,
  aiAgentVersions,
  aiBudgetPeriods,
  aiConversationControls,
  aiDocuments,
  aiDocumentVersions,
  aiJobs,
  aiKnowledgeChunks,
  aiMemories,
  aiRuns,
  contacts,
  conversations,
  users,
} from "@/lib/db/schema";
import { reconcileAiBudget, reserveAiBudget } from "./budget";
import { claimNextAiJob } from "./jobs";
import { clearAiMemory, loadActiveMemories, retrieveAuthorizedKnowledge } from "./retrieval";
import { isAiSendEligible } from "./runtime";

const ids = {
  userA: randomUUID(),
  userB: randomUUID(),
  accountA: randomUUID(),
  accountB: randomUUID(),
  contactA: randomUUID(),
  contactB: randomUUID(),
  conversationA: randomUUID(),
  conversationB: randomUUID(),
  agentA: randomUUID(),
  versionA: randomUUID(),
};

const dbDescribe = process.env.RUN_DB_TESTS === "true" ? describe.sequential : describe.skip;

dbDescribe("ZC-11 PostgreSQL invariants", () => {
beforeAll(async () => {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("zc11_ai_test")) throw new Error("ZC-11 integration tests require an isolated zc11_ai_test database");
  await db.insert(users).values([
    { id: ids.userA, email: `zc11-a-${ids.userA}@example.test`, name: "Tenant A" },
    { id: ids.userB, email: `zc11-b-${ids.userB}@example.test`, name: "Tenant B" },
  ]);
  await db.insert(accounts).values([
    { id: ids.accountA, name: "ZC11 A", ownerUserId: ids.userA },
    { id: ids.accountB, name: "ZC11 B", ownerUserId: ids.userB },
  ]);
  await db.insert(contacts).values([
    { id: ids.contactA, accountId: ids.accountA, userId: ids.userA, phone: "+5500001", phoneNormalized: "5500001" },
    { id: ids.contactB, accountId: ids.accountB, userId: ids.userB, phone: "+5500002", phoneNormalized: "5500002" },
  ]);
  await db.insert(conversations).values([
    { id: ids.conversationA, accountId: ids.accountA, userId: ids.userA, contactId: ids.contactA },
    { id: ids.conversationB, accountId: ids.accountB, userId: ids.userB, contactId: ids.contactB },
  ]);
  await db.insert(aiAgents).values({
    id: ids.agentA,
    accountId: ids.accountA,
    name: "Synthetic agent",
    status: "active",
    currentVersion: 1,
    createdByUserId: ids.userA,
  });
  await db.insert(aiAgentVersions).values({
    id: ids.versionA,
    accountId: ids.accountA,
    agentId: ids.agentA,
    version: 1,
    instructions: "Use somente fontes.",
    authorizedChannels: ["whatsapp"],
    allowedTools: ["create_task"],
    generationProvider: "openai",
    generationModel: "synthetic-model",
    embeddingsProvider: "openai",
    embeddingsModel: "synthetic-embedding",
    inputPriceMicrosPerMillion: 1_000_000,
    outputPriceMicrosPerMillion: 1_000_000,
    embeddingPriceMicrosPerMillion: 1_000_000,
    perCallLimitMicros: 1_000_000,
    monthlyLimitMicros: 10_000,
    maxInputTokens: 4_000,
    maxOutputTokens: 500,
    maxConcurrency: 2,
    memoryRetentionDays: 30,
    handoffCriteria: ["sem fonte"],
    createdByUserId: ids.userA,
  });
});
  it("never retrieves another tenant and excludes a removed source", async () => {
    const docA = randomUUID();
    const docB = randomUUID();
    const versionA = randomUUID();
    const versionB = randomUUID();
    await db.insert(aiDocuments).values([
      { id: docA, accountId: ids.accountA, title: "A", mimeType: "text/plain", status: "ready", createdByUserId: ids.userA },
      { id: docB, accountId: ids.accountB, title: "B", mimeType: "text/plain", status: "ready", createdByUserId: ids.userB },
    ]);
    await db.insert(aiDocumentVersions).values([
      { id: versionA, accountId: ids.accountA, documentId: docA, version: 1, content: "segredo alfa tenant A", contentSha256: "a", byteSize: 21, status: "ready" },
      { id: versionB, accountId: ids.accountB, documentId: docB, version: 1, content: "segredo alfa tenant B", contentSha256: "b", byteSize: 21, status: "ready" },
    ]);
    await db.insert(aiKnowledgeChunks).values([
      { accountId: ids.accountA, documentId: docA, documentVersionId: versionA, chunkIndex: 0, content: "segredo alfa tenant A", tokenEstimate: 6 },
      { accountId: ids.accountB, documentId: docB, documentVersionId: versionB, chunkIndex: 0, content: "segredo alfa tenant B", tokenEstimate: 6 },
    ]);
    const tenantA = await retrieveAuthorizedKnowledge({ accountId: ids.accountA, query: "segredo alfa" });
    expect(tenantA).toHaveLength(1);
    expect(tenantA[0].content).toContain("tenant A");
    await db.update(aiDocuments).set({ status: "removed", removedAt: new Date() }).where(and(eq(aiDocuments.id, docA), eq(aiDocuments.accountId, ids.accountA)));
    expect(await retrieveAuthorizedKnowledge({ accountId: ids.accountA, query: "segredo alfa" })).toEqual([]);
  });

  it("clears memory without exposing it again", async () => {
    await db.insert(aiMemories).values({
      accountId: ids.accountA,
      contactId: ids.contactA,
      conversationId: ids.conversationA,
      kind: "preference",
      content: "prefere contato de manhã",
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect(await loadActiveMemories({ accountId: ids.accountA, contactId: ids.contactA, conversationId: ids.conversationA })).toHaveLength(1);
    await clearAiMemory(ids.accountA, ids.contactA);
    expect(await loadActiveMemories({ accountId: ids.accountA, contactId: ids.contactA, conversationId: ids.conversationA })).toEqual([]);
    const rows = await db.select().from(aiMemories).where(eq(aiMemories.accountId, ids.accountA));
    expect(rows.every((row) => row.content === "[REDACTED]" && row.deletedAt)).toBe(true);
  });

  it("reserves budget and concurrency atomically under race", async () => {
    const attempts = await Promise.all(Array.from({ length: 8 }, (_, index) => reserveAiBudget({
      accountId: ids.accountA,
      agentId: ids.agentA,
      agentVersionId: ids.versionA,
      conversationId: ids.conversationA,
      sourceMessageId: null,
      kind: "generation",
      idempotencyKey: `race:${index}`,
      controlGeneration: 0,
      provider: "openai",
      model: "synthetic-model",
      reservedMicros: 1_000,
      monthlyLimitMicros: 10_000,
      maxConcurrency: 2,
    })));
    const accepted = attempts.filter((result) => result.ok && !result.replay);
    expect(accepted).toHaveLength(2);
    const [period] = await db.select().from(aiBudgetPeriods).where(eq(aiBudgetPeriods.accountId, ids.accountA));
    expect(period.activeReservations).toBe(2);
    expect(period.reservedMicros).toBe(2_000);
    for (const result of accepted) {
      if (!result.ok) continue;
      await reconcileAiBudget({
        accountId: ids.accountA,
        runId: result.run.id,
        status: "failed",
        actualCostMicros: null,
        inputTokens: null,
        outputTokens: null,
        durationMs: 1,
        errorCode: "timeout_unknown_cost",
      });
    }
    const [after] = await db.select().from(aiBudgetPeriods).where(eq(aiBudgetPeriods.accountId, ids.accountA));
    expect(after.activeReservations).toBe(0);
    expect(after.reservedMicros).toBe(0);
    expect(after.spentMicros).toBe(2_000);
  });

  it("makes a repeated reservation idempotent", async () => {
    const args = {
      accountId: ids.accountA,
      agentId: ids.agentA,
      agentVersionId: ids.versionA,
      conversationId: ids.conversationA,
      sourceMessageId: null,
      kind: "generation",
      idempotencyKey: "replay:stable",
      controlGeneration: 0,
      provider: "openai",
      model: "synthetic-model",
      reservedMicros: 500,
      monthlyLimitMicros: 10_000,
      maxConcurrency: 2,
    } as const;
    const first = await reserveAiBudget(args);
    const replay = await reserveAiBudget(args);
    expect(first.ok && !first.replay).toBe(true);
    expect(replay.ok && replay.replay).toBe(true);
    if (first.ok) await reconcileAiBudget({
      accountId: ids.accountA,
      runId: first.run.id,
      status: "completed",
      actualCostMicros: 100,
      inputTokens: 50,
      outputTokens: 50,
      durationMs: 5,
    });
    expect(await db.select().from(aiRuns).where(and(eq(aiRuns.accountId, ids.accountA), eq(aiRuns.idempotencyKey, "replay:stable")))).toHaveLength(1);
  });

  it("invalidates an in-flight generation on handoff and blocks opt-out/suspension", async () => {
    await db.insert(aiConversationControls).values({
      accountId: ids.accountA,
      conversationId: ids.conversationA,
      mode: "active",
      generation: 0,
    }).onConflictDoNothing();
    const eligibility = () => isAiSendEligible({
      accountId: ids.accountA,
      conversationId: ids.conversationA,
      contactId: ids.contactA,
      agentId: ids.agentA,
      controlGeneration: 0,
    });
    expect(await eligibility()).toBe(true);
    await db.update(aiConversationControls).set({ mode: "handoff", generation: sql`${aiConversationControls.generation} + 1` }).where(eq(aiConversationControls.conversationId, ids.conversationA));
    expect(await eligibility()).toBe(false);
    await db.update(aiConversationControls).set({ mode: "active", generation: 0 }).where(eq(aiConversationControls.conversationId, ids.conversationA));
    await db.update(contacts).set({ optOut: true }).where(eq(contacts.id, ids.contactA));
    expect(await eligibility()).toBe(false);
    await db.update(contacts).set({ optOut: false }).where(eq(contacts.id, ids.contactA));
    await db.update(accounts).set({ status: "suspended" }).where(eq(accounts.id, ids.accountA));
    expect(await eligibility()).toBe(false);
    await db.update(accounts).set({ status: "active" }).where(eq(accounts.id, ids.accountA));
  });

  it("reclaims a stale processing job after worker restart", async () => {
    await db.delete(aiJobs);
    const [job] = await db.insert(aiJobs).values({
      accountId: ids.accountA,
      type: "ingest_document",
      idempotencyKey: "restart:job",
      status: "processing",
      payload: { documentId: randomUUID(), documentVersionId: randomUUID() },
      attempts: 1,
      leaseExpiresAt: new Date(Date.now() - 60_000),
    }).returning();
    const reclaimed = await claimNextAiJob();
    expect(reclaimed?.id).toBe(job.id);
    expect(reclaimed?.attempts).toBe(2);
    expect(reclaimed?.status).toBe("processing");
  });
});
