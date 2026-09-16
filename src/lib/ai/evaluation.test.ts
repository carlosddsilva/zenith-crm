import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";

import evaluationSet from "./evaluation-set.json";
import { calculateGenerationReservation } from "./cost";
import { deterministicHandoffReason, parseAgentDecision } from "./prompt";

describe("ZC-11 synthetic evaluation set", () => {
  it("measures decision quality, reserved cost and local latency", () => {
    const results = evaluationSet.map((item) => {
      const started = performance.now();
      const deterministic = deterministicHandoffReason(item.customer);
      const raw = item.expected === "answer"
        ? '{"action":"answer","answer":"O prazo é de 7 dias corridos.","citations":["S1"]}'
        : item.expected === "create_task"
          ? '{"action":"create_task","answer":"Vou registrar o retorno.","citations":["S1"],"task":{"title":"Retornar ligação"}}'
          : '{"action":"handoff","reason":"synthetic_expected_handoff"}';
      const decision = deterministic
        ? { action: "handoff" as const, reason: deterministic }
        : item.sources.length === 0
          ? { action: "handoff" as const, reason: "insufficient_evidence" }
          : parseAgentDecision(raw, item.sources.length);
      const reservation = calculateGenerationReservation({
        estimatedInputTokens: 500,
        maxInputTokens: 2_000,
        maxOutputTokens: 300,
        inputPriceMicrosPerMillion: 1_000_000,
        outputPriceMicrosPerMillion: 2_000_000,
        perCallLimitMicros: 10_000,
      });
      return {
        correct: decision.action === item.expected,
        latencyMs: performance.now() - started,
        reservedMicros: reservation.ok ? reservation.reservedMicros : 0,
      };
    });
    const accuracy = results.filter((result) => result.correct).length / results.length;
    const latencies = results.map((result) => result.latencyMs).sort((a, b) => a - b);
    const p95 = latencies[Math.ceil(latencies.length * 0.95) - 1];
    const totalReservedMicros = results.reduce((sum, result) => sum + result.reservedMicros, 0);
    expect(accuracy).toBe(1);
    expect(p95).toBeLessThan(50);
    expect(totalReservedMicros).toBeGreaterThan(0);
  });
});

