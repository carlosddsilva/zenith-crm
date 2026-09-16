import { and, desc, eq } from "drizzle-orm";

import { apiErrorResponse } from "@/lib/api/error-response";
import { logAuditAction } from "@/lib/audit/logger";
import { requireZenithRole } from "@/lib/auth/zenith-account";
import { db } from "@/lib/db/client";
import { aiAgents, aiAgentVersions } from "@/lib/db/schema";
import { agentVersionInputSchema, validateActivatableAgent } from "@/lib/ai/validation";
import { encrypt } from "@/lib/whatsapp/encryption";

export async function GET() {
  try {
    const { accountId } = await requireZenithRole("viewer");
    const [agent] = await db.select({
      id: aiAgents.id,
      name: aiAgents.name,
      status: aiAgents.status,
      currentVersion: aiAgents.currentVersion,
      hasGenerationKey: aiAgents.generationApiKeyEncrypted,
      hasEmbeddingsKey: aiAgents.embeddingsApiKeyEncrypted,
      updatedAt: aiAgents.updatedAt,
    }).from(aiAgents).where(eq(aiAgents.accountId, accountId)).limit(1);
    if (!agent) return Response.json({ item: null, versions: [] });
    const versions = await db.select().from(aiAgentVersions).where(and(
      eq(aiAgentVersions.accountId, accountId),
      eq(aiAgentVersions.agentId, agent.id),
    )).orderBy(desc(aiAgentVersions.version)).limit(20);
    return Response.json({
      item: {
        ...agent,
        hasGenerationKey: Boolean(agent.hasGenerationKey),
        hasEmbeddingsKey: Boolean(agent.hasEmbeddingsKey),
      },
      versions,
    });
  } catch (error) {
    return apiErrorResponse(error, "[GET /api/zenith/ai/config]");
  }
}

export async function PUT(request: Request) {
  try {
    const context = await requireZenithRole("admin");
    const { accountId, userId } = context;
    const parsed = agentVersionInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid config" }, { status: 400 });
    }
    const input = parsed.data;
    const [existing] = await db.select().from(aiAgents).where(eq(aiAgents.accountId, accountId)).limit(1);
    const hasGenerationKey = Boolean(input.generationApiKey || existing?.generationApiKeyEncrypted);
    const hasEmbeddingsKey = Boolean(input.embeddingsApiKey || existing?.embeddingsApiKeyEncrypted);
    const activationError = input.status === "active" ? validateActivatableAgent({
      ...input,
      hasGenerationKey,
      hasEmbeddingsKey,
    }) : null;
    if (activationError) return Response.json({ error: activationError }, { status: 409 });

    const saved = await db.transaction(async (tx) => {
      const nextVersion = (existing?.currentVersion ?? 0) + 1;
      const encryptedGeneration = input.generationApiKey
        ? encrypt(input.generationApiKey)
        : existing?.generationApiKeyEncrypted ?? null;
      const encryptedEmbeddings = input.embeddingsApiKey
        ? encrypt(input.embeddingsApiKey)
        : existing?.embeddingsApiKeyEncrypted ?? null;
      const [agent] = existing
        ? await tx.update(aiAgents).set({
            name: input.name,
            status: input.status,
            currentVersion: nextVersion,
            generationApiKeyEncrypted: encryptedGeneration,
            embeddingsApiKeyEncrypted: encryptedEmbeddings,
            updatedAt: new Date(),
          }).where(and(eq(aiAgents.id, existing.id), eq(aiAgents.accountId, accountId))).returning()
        : await tx.insert(aiAgents).values({
            accountId,
            name: input.name,
            status: input.status,
            currentVersion: nextVersion,
            generationApiKeyEncrypted: encryptedGeneration,
            embeddingsApiKeyEncrypted: encryptedEmbeddings,
            createdByUserId: userId,
          }).returning();
      const [version] = await tx.insert(aiAgentVersions).values({
        accountId,
        agentId: agent.id,
        version: nextVersion,
        instructions: input.instructions,
        authorizedChannels: input.authorizedChannels,
        allowedTools: input.allowedTools,
        generationProvider: input.generationProvider,
        generationModel: input.generationModel,
        embeddingsProvider: input.embeddingsProvider,
        embeddingsModel: input.embeddingsModel,
        inputPriceMicrosPerMillion: input.inputPriceMicrosPerMillion,
        outputPriceMicrosPerMillion: input.outputPriceMicrosPerMillion,
        embeddingPriceMicrosPerMillion: input.embeddingPriceMicrosPerMillion,
        perCallLimitMicros: input.perCallLimitMicros,
        monthlyLimitMicros: input.monthlyLimitMicros,
        maxInputTokens: input.maxInputTokens,
        maxOutputTokens: input.maxOutputTokens,
        maxConcurrency: input.maxConcurrency,
        memoryRetentionDays: input.memoryRetentionDays,
        handoffCriteria: input.handoffCriteria,
        createdByUserId: userId,
      }).returning();
      return { agent: { ...agent, generationApiKeyEncrypted: undefined, embeddingsApiKeyEncrypted: undefined }, version };
    });
    await logAuditAction({
      context,
      action: "AI_CONFIGURE",
      entityType: "AI_AGENT",
      entityId: saved.agent.id,
      metadata: { version: saved.version.version, status: input.status },
    });
    return Response.json(saved);
  } catch (error) {
    return apiErrorResponse(error, "[PUT /api/zenith/ai/config]");
  }
}

export async function DELETE() {
  try {
    const context = await requireZenithRole("admin");
    const { accountId } = context;
    await db.update(aiAgents).set({ status: "inactive", updatedAt: new Date() }).where(eq(aiAgents.accountId, accountId));
    await logAuditAction({ context, action: "AI_CONFIGURE", entityType: "AI_AGENT", entityId: accountId, metadata: { status: "inactive" } });
    return Response.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "[DELETE /api/zenith/ai/config]");
  }
}
