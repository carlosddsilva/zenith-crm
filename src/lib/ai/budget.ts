import { and, eq, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { aiBudgetPeriods, aiRuns } from "@/lib/db/schema";

type ReserveArgs = {
  accountId: string;
  agentId: string;
  agentVersionId: string;
  conversationId: string | null;
  sourceMessageId: string | null;
  kind: string;
  idempotencyKey: string;
  controlGeneration: number | null;
  provider: string;
  model: string;
  reservedMicros: number;
  monthlyLimitMicros: number;
  maxConcurrency: number;
  now?: Date;
};

function monthBounds(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

class ReplayReservation extends Error {}

export async function reserveAiBudget(args: ReserveArgs) {
  const now = args.now ?? new Date();
  const { start, end } = monthBounds(now);
  try {
    return await db.transaction(async (tx) => {
      await tx.insert(aiBudgetPeriods).values({
        accountId: args.accountId,
        periodStart: start,
        periodEnd: end,
        limitMicros: args.monthlyLimitMicros,
      }).onConflictDoNothing({
        target: [aiBudgetPeriods.accountId, aiBudgetPeriods.periodStart],
      });

      const [period] = await tx
        .update(aiBudgetPeriods)
        .set({
          limitMicros: args.monthlyLimitMicros,
          reservedMicros: sql`${aiBudgetPeriods.reservedMicros} + ${args.reservedMicros}`,
          activeReservations: sql`${aiBudgetPeriods.activeReservations} + 1`,
          updatedAt: now,
        })
        .where(and(
          eq(aiBudgetPeriods.accountId, args.accountId),
          eq(aiBudgetPeriods.periodStart, start),
          lte(
            sql`${aiBudgetPeriods.spentMicros} + ${aiBudgetPeriods.reservedMicros} + ${args.reservedMicros}`,
            args.monthlyLimitMicros,
          ),
          lte(sql`${aiBudgetPeriods.activeReservations} + 1`, args.maxConcurrency),
        ))
        .returning();

      if (!period) return { ok: false as const, code: "budget_or_concurrency_exceeded" };

      const [run] = await tx.insert(aiRuns).values({
        accountId: args.accountId,
        agentId: args.agentId,
        agentVersionId: args.agentVersionId,
        budgetPeriodId: period.id,
        conversationId: args.conversationId,
        sourceMessageId: args.sourceMessageId,
        kind: args.kind,
        idempotencyKey: args.idempotencyKey,
        controlGeneration: args.controlGeneration,
        provider: args.provider,
        model: args.model,
        reservedMicros: args.reservedMicros,
        reservationExpiresAt: new Date(now.getTime() + 2 * 60_000),
      }).onConflictDoNothing({
        target: [aiRuns.accountId, aiRuns.idempotencyKey],
      }).returning();

      if (!run) throw new ReplayReservation();
      return { ok: true as const, run, replay: false };
    });
  } catch (error) {
    if (!(error instanceof ReplayReservation)) throw error;
    const [existing] = await db.select().from(aiRuns).where(and(
      eq(aiRuns.accountId, args.accountId),
      eq(aiRuns.idempotencyKey, args.idempotencyKey),
    )).limit(1);
    return existing
      ? { ok: true as const, run: existing, replay: true }
      : { ok: false as const, code: "reservation_race" };
  }
}

export async function reconcileAiBudget(args: {
  accountId: string;
  runId: string;
  status: "completed" | "failed" | "cancelled" | "handoff";
  actualCostMicros: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  resultCode?: string | null;
  errorCode?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [run] = await tx.select().from(aiRuns).where(and(
      eq(aiRuns.id, args.runId),
      eq(aiRuns.accountId, args.accountId),
    )).for("update").limit(1);
    if (!run || !["reserved", "running"].includes(run.status)) return run ?? null;

    const charged = args.actualCostMicros ?? run.reservedMicros;
    await tx.update(aiBudgetPeriods).set({
      reservedMicros: sql`GREATEST(0, ${aiBudgetPeriods.reservedMicros} - ${run.reservedMicros})`,
      spentMicros: sql`${aiBudgetPeriods.spentMicros} + ${charged}`,
      activeReservations: sql`GREATEST(0, ${aiBudgetPeriods.activeReservations} - 1)`,
      updatedAt: new Date(),
    }).where(and(
      eq(aiBudgetPeriods.id, run.budgetPeriodId),
      eq(aiBudgetPeriods.accountId, args.accountId),
    ));

    const [updated] = await tx.update(aiRuns).set({
      status: args.status,
      actualCostMicros: charged,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      usageKnown: args.actualCostMicros === null ? 0 : 1,
      durationMs: args.durationMs,
      resultCode: args.resultCode ?? null,
      errorCode: args.errorCode ?? null,
      outputText: null,
      completedAt: new Date(),
    }).where(and(
      eq(aiRuns.id, run.id),
      eq(aiRuns.accountId, args.accountId),
      inArray(aiRuns.status, ["reserved", "running"]),
    )).returning();
    return updated ?? run;
  });
}

export async function expireAiReservations(now = new Date()) {
  const expired = await db.select().from(aiRuns).where(and(
    inArray(aiRuns.status, ["reserved", "running"]),
    lte(aiRuns.reservationExpiresAt, now),
  ));
  for (const run of expired) {
    await reconcileAiBudget({
      accountId: run.accountId,
      runId: run.id,
      status: "failed",
      actualCostMicros: null,
      inputTokens: null,
      outputTokens: null,
      durationMs: 0,
      errorCode: "reservation_expired_unknown_cost",
    });
  }
  return expired.length;
}
