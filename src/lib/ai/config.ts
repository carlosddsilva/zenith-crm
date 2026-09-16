import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { aiAgents, aiAgentVersions } from "@/lib/db/schema";
import { decrypt } from "@/lib/whatsapp/encryption";

export async function loadCurrentAgent(accountId: string, requireActive = true) {
  const [row] = await db.select({
    agent: aiAgents,
    version: aiAgentVersions,
  }).from(aiAgents).innerJoin(aiAgentVersions, and(
    eq(aiAgentVersions.agentId, aiAgents.id),
    eq(aiAgentVersions.accountId, aiAgents.accountId),
    eq(aiAgentVersions.version, aiAgents.currentVersion),
  )).where(and(
    eq(aiAgents.accountId, accountId),
    ...(requireActive ? [eq(aiAgents.status, "active")] : []),
  )).limit(1);
  if (!row) return null;
  return {
    ...row,
    generationApiKey: row.agent.generationApiKeyEncrypted
      ? decrypt(row.agent.generationApiKeyEncrypted)
      : null,
    embeddingsApiKey: row.agent.embeddingsApiKeyEncrypted
      ? decrypt(row.agent.embeddingsApiKeyEncrypted)
      : null,
  };
}

export function aiRequestTimeoutMs() {
  const configured = Number(process.env.AI_REQUEST_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 1_000 && configured <= 120_000
    ? Math.floor(configured)
    : 30_000;
}

