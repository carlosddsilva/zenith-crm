import { AiError } from "./types";
import type {
  AiGenerationAdapter,
  AiProviderRequest,
  AiProviderResult,
  AiUsage,
} from "./types";

function normalizedUsage(input: unknown, output: unknown): AiUsage | null {
  const inputTokens = typeof input === "number" && input >= 0 ? Math.floor(input) : 0;
  const outputTokens = typeof output === "number" && output >= 0 ? Math.floor(output) : 0;
  return inputTokens || outputTokens ? { inputTokens, outputTokens } : null;
}

async function providerError(provider: string, response: Response) {
  let providerMessage = "";
  try {
    const data = await response.json() as { error?: { message?: string } | string };
    providerMessage = typeof data.error === "string" ? data.error : data.error?.message ?? "";
  } catch {
    // A provider's HTML/plain-text error is deliberately not persisted.
  }
  const code = response.status === 429
    ? "rate_limited"
    : response.status === 401 || response.status === 403
      ? "invalid_credentials"
      : "provider_error";
  return new AiError(
    `${provider} request failed${providerMessage ? `: ${providerMessage}` : ""}`,
    code,
    code === "rate_limited" ? 429 : 502,
  );
}

function networkError(error: unknown) {
  const timeout = error instanceof DOMException && error.name === "TimeoutError";
  return new AiError(
    timeout ? "AI provider timeout" : "AI provider network failure",
    timeout ? "timeout" : "network_error",
    timeout ? 504 : 502,
  );
}

export const fetchGenerationAdapter: AiGenerationAdapter = {
  async generate(request: AiProviderRequest): Promise<AiProviderResult> {
    if (request.provider === "openai") return generateOpenAi(request);
    return generateAnthropic(request);
  },
};

async function generateOpenAi(request: AiProviderRequest): Promise<AiProviderResult> {
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${request.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        messages: [
          { role: "system", content: request.systemPrompt },
          ...request.messages,
        ],
        max_completion_tokens: request.maxOutputTokens,
      }),
      signal: AbortSignal.timeout(request.timeoutMs),
    });
  } catch (error) {
    throw networkError(error);
  }
  if (!response.ok) throw await providerError("OpenAI", response);
  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AiError("AI provider returned no text", "empty_response");
  return {
    text,
    usage: normalizedUsage(data.usage?.prompt_tokens, data.usage?.completion_tokens),
  };
}

async function generateAnthropic(request: AiProviderRequest): Promise<AiProviderResult> {
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": request.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        system: request.systemPrompt,
        messages: request.messages,
        max_tokens: request.maxOutputTokens,
      }),
      signal: AbortSignal.timeout(request.timeoutMs),
    });
  } catch (error) {
    throw networkError(error);
  }
  if (!response.ok) throw await providerError("Anthropic", response);
  const data = await response.json() as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = data.content
    ?.filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .trim();
  if (!text) throw new AiError("AI provider returned no text", "empty_response");
  return {
    text,
    usage: normalizedUsage(data.usage?.input_tokens, data.usage?.output_tokens),
  };
}

export async function embedTexts(args: {
  apiKey: string;
  model: string;
  inputs: string[];
  timeoutMs: number;
}) {
  if (args.inputs.length === 0) return { embeddings: [] as number[][], usageTokens: 0 };
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: args.model, input: args.inputs }),
      signal: AbortSignal.timeout(args.timeoutMs),
    });
  } catch (error) {
    throw networkError(error);
  }
  if (!response.ok) throw await providerError("OpenAI embeddings", response);
  const data = await response.json() as {
    data?: Array<{ index?: number; embedding?: number[] }>;
    usage?: { total_tokens?: number };
  };
  if (!data.data || data.data.length !== args.inputs.length) {
    throw new AiError("Embedding response was malformed", "embedding_malformed");
  }
  const ordered = [...data.data].sort((a, b) => (a.index ?? -1) - (b.index ?? -1));
  if (ordered.some((item) => item.index === undefined || item.embedding?.length !== 1536)) {
    throw new AiError("Embedding dimensions do not match the configured index", "embedding_dimensions");
  }
  return {
    embeddings: ordered.map((item) => item.embedding!),
    usageTokens: typeof data.usage?.total_tokens === "number"
      ? Math.max(0, Math.floor(data.usage.total_tokens))
      : 0,
  };
}

