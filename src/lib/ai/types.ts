export type AiProviderName = "openai" | "anthropic";

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiProviderResult {
  text: string;
  usage: AiUsage | null;
}

export interface AiProviderRequest {
  provider: AiProviderName;
  model: string;
  apiKey: string;
  systemPrompt: string;
  messages: AiChatMessage[];
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface AiGenerationAdapter {
  generate(request: AiProviderRequest): Promise<AiProviderResult>;
}

export interface RetrievedSource {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  title: string;
  content: string;
  score: number | null;
}

export type AgentDecision =
  | { action: "answer"; answer: string; citations: string[] }
  | { action: "handoff"; reason: string }
  | {
      action: "create_task";
      answer: string;
      citations: string[];
      task: { title: string; description?: string };
    };

export class AiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code = "ai_error", status = 502) {
    super(message);
    this.name = "AiError";
    this.code = code;
    this.status = status;
  }
}

