export function calculateCostMicros(
  inputTokens: number,
  outputTokens: number,
  inputPriceMicrosPerMillion: number,
  outputPriceMicrosPerMillion: number,
) {
  const raw =
    (inputTokens * inputPriceMicrosPerMillion +
      outputTokens * outputPriceMicrosPerMillion) /
    1_000_000;
  return Math.ceil(raw);
}

export function calculateEmbeddingCostMicros(
  tokens: number,
  priceMicrosPerMillion: number,
) {
  return Math.ceil((tokens * priceMicrosPerMillion) / 1_000_000);
}

export function calculateGenerationReservation(args: {
  estimatedInputTokens: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  inputPriceMicrosPerMillion: number;
  outputPriceMicrosPerMillion: number;
  perCallLimitMicros: number;
}) {
  const inputTokens = Math.min(
    Math.max(1, Math.ceil(args.estimatedInputTokens)),
    args.maxInputTokens,
  );
  const reserved = calculateCostMicros(
    inputTokens,
    args.maxOutputTokens,
    args.inputPriceMicrosPerMillion,
    args.outputPriceMicrosPerMillion,
  );
  return reserved <= args.perCallLimitMicros
    ? { ok: true as const, reservedMicros: reserved, inputTokens }
    : { ok: false as const, code: "per_call_budget_exceeded" };
}

