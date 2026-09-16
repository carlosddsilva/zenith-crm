import { z } from "zod";

export const AI_ALLOWED_CHANNELS = ["whatsapp"] as const;
export const AI_ALLOWED_TOOLS = ["create_task"] as const;
export const AI_ALLOWED_MIME_TYPES = [
  "text/plain",
  "text/markdown",
  "application/json",
] as const;

export const MAX_AI_DOCUMENT_BYTES = 1_000_000;
export const MAX_AI_INSTRUCTIONS_CHARS = 20_000;

const positiveSafeInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const agentVersionInputSchema = z.object({
  status: z.enum(["inactive", "active"]).default("inactive"),
  name: z.string().trim().min(1).max(120),
  instructions: z.string().trim().min(1).max(MAX_AI_INSTRUCTIONS_CHARS),
  authorizedChannels: z.array(z.enum(AI_ALLOWED_CHANNELS)).min(1),
  allowedTools: z.array(z.enum(AI_ALLOWED_TOOLS)).max(AI_ALLOWED_TOOLS.length),
  generationProvider: z.enum(["openai", "anthropic"]),
  generationModel: z.string().trim().min(1).max(200),
  embeddingsProvider: z.literal("openai"),
  embeddingsModel: z.string().trim().min(1).max(200),
  inputPriceMicrosPerMillion: positiveSafeInteger,
  outputPriceMicrosPerMillion: positiveSafeInteger,
  embeddingPriceMicrosPerMillion: positiveSafeInteger,
  perCallLimitMicros: positiveSafeInteger,
  monthlyLimitMicros: positiveSafeInteger,
  maxInputTokens: z.number().int().min(128).max(200_000),
  maxOutputTokens: z.number().int().min(32).max(16_384),
  maxConcurrency: z.number().int().min(1).max(100),
  memoryRetentionDays: z.number().int().min(1).max(365),
  handoffCriteria: z.array(z.string().trim().min(1).max(300)).max(30),
  generationApiKey: z.string().trim().min(8).max(10_000).optional(),
  embeddingsApiKey: z.string().trim().min(8).max(10_000).optional(),
});

export const documentInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  mimeType: z.enum(AI_ALLOWED_MIME_TYPES),
  content: z.string().min(1),
});

export function validateDocumentContent(content: string) {
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_AI_DOCUMENT_BYTES) {
    return { ok: false as const, code: "document_too_large", bytes };
  }
  if (content.includes("\u0000")) {
    return { ok: false as const, code: "binary_content_rejected", bytes };
  }
  const controlCharacters = [...content].filter((char) => {
    const code = char.charCodeAt(0);
    return code < 32 && ![9, 10, 13].includes(code);
  }).length;
  if (controlCharacters > Math.max(8, content.length * 0.01)) {
    return { ok: false as const, code: "binary_content_rejected", bytes };
  }
  return { ok: true as const, bytes };
}

export function validateActivatableAgent(config: {
  generationModel: string;
  embeddingsModel: string;
  inputPriceMicrosPerMillion: number;
  outputPriceMicrosPerMillion: number;
  embeddingPriceMicrosPerMillion: number;
  perCallLimitMicros: number;
  monthlyLimitMicros: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxConcurrency: number;
  hasGenerationKey: boolean;
  hasEmbeddingsKey: boolean;
}) {
  if (!config.generationModel || !config.embeddingsModel) return "model_missing";
  if (!config.hasGenerationKey || !config.hasEmbeddingsKey) return "credentials_missing";
  if (
    config.inputPriceMicrosPerMillion <= 0 ||
    config.outputPriceMicrosPerMillion <= 0 ||
    config.embeddingPriceMicrosPerMillion <= 0
  ) return "pricing_invalid";
  if (
    config.perCallLimitMicros <= 0 ||
    config.monthlyLimitMicros <= 0 ||
    config.maxInputTokens <= 0 ||
    config.maxOutputTokens <= 0 ||
    config.maxConcurrency <= 0
  ) return "limits_invalid";
  return null;
}
