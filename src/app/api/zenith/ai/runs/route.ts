import { and, desc, eq, gte, sql } from "drizzle-orm";

import { apiErrorResponse } from "@/lib/api/error-response";
import { requireZenithRole } from "@/lib/auth/zenith-account";
import { db } from "@/lib/db/client";
import { aiBudgetPeriods, aiRuns } from "@/lib/db/schema";

export async function GET(request: Request) {
  try {
    const context = await requireZenithRole("viewer");
    const { accountId } = context;
    const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get("days") ?? 30), 1), 90);
    const since = new Date(Date.now() - days * 86_400_000);
    const [items, totals, budgets] = await Promise.all([
      db.select({
        id: aiRuns.id,
        kind: aiRuns.kind,
        status: aiRuns.status,
        provider: aiRuns.provider,
        model: aiRuns.model,
        inputTokens: aiRuns.inputTokens,
        outputTokens: aiRuns.outputTokens,
        costMicros: aiRuns.actualCostMicros,
        usageKnown: aiRuns.usageKnown,
        durationMs: aiRuns.durationMs,
        resultCode: aiRuns.resultCode,
        errorCode: aiRuns.errorCode,
        createdAt: aiRuns.createdAt,
      }).from(aiRuns).where(and(eq(aiRuns.accountId, accountId), gte(aiRuns.createdAt, since))).orderBy(desc(aiRuns.createdAt)).limit(200),
      db.select({
        runs: sql<number>`count(*)::int`,
        costMicros: sql<number>`coalesce(sum(${aiRuns.actualCostMicros}), 0)::bigint`,
        inputTokens: sql<number>`coalesce(sum(${aiRuns.inputTokens}), 0)::bigint`,
        outputTokens: sql<number>`coalesce(sum(${aiRuns.outputTokens}), 0)::bigint`,
      }).from(aiRuns).where(and(eq(aiRuns.accountId, accountId), gte(aiRuns.createdAt, since))),
      db.select().from(aiBudgetPeriods).where(eq(aiBudgetPeriods.accountId, accountId)).orderBy(desc(aiBudgetPeriods.periodStart)).limit(3),
    ]);
    return Response.json({ items, totals: totals[0], budgets, currency: context.account.defaultCurrency });
  } catch (error) {
    return apiErrorResponse(error, "[GET /api/zenith/ai/runs]");
  }
}
