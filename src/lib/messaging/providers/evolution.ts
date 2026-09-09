import {
  assertProviderCanSend,
  messagingCapabilities,
} from "../capabilities";

import type {
  EvolutionMessagingConfig,
  MessagingProvider,
  MessagingProviderConfig,
  MessagingSendRequest,
  MessagingSendResult,
} from "../types";

import {
  MessagingProviderError,
} from "../types";

function requireEvolutionConfig(
  config: MessagingProviderConfig,
): EvolutionMessagingConfig {
  if (
    config.provider !==
    "evolution"
  ) {
    throw new MessagingProviderError(
      "invalid_provider_config",
      "Configuração Evolution inválida.",
      500,
    );
  }

  if (
    !config.baseUrl ||
    !config.apiKey ||
    !config.instanceName
  ) {
    throw new MessagingProviderError(
      "evolution_not_configured",
      "Evolution API não configurada.",
      400,
    );
  }

  return config;
}

function normalizeBaseUrl(
  value: string,
) {
  return value.replace(
    /\/+$/,
    "",
  );
}

function extractProviderMessageId(
  payload: unknown,
): string | null {
  if (
    !payload ||
    typeof payload !== "object"
  ) {
    return null;
  }

  const data =
    payload as Record<
      string,
      unknown
    >;

  const directCandidates = [
    data.messageId,
    data.id,
  ];

  for (
    const candidate of
      directCandidates
  ) {
    if (
      typeof candidate ===
        "string" &&
      candidate
    ) {
      return candidate;
    }
  }

  if (
    data.key &&
    typeof data.key === "object"
  ) {
    const key =
      data.key as Record<
        string,
        unknown
      >;

    const candidate =
      key.id ?? key.ID;

    if (
      typeof candidate ===
        "string" &&
      candidate
    ) {
      return candidate;
    }
  }

  if (
    data.data &&
    typeof data.data === "object"
  ) {
    const nested =
      data.data as Record<
        string,
        unknown
      >;

    if (
      nested.key &&
      typeof nested.key ===
        "object"
    ) {
      const key =
        nested.key as Record<
          string,
          unknown
        >;

      const candidate =
        key.id ?? key.ID;

      if (
        typeof candidate ===
          "string" &&
        candidate
      ) {
        return candidate;
      }
    }

    if (
      nested.Info &&
      typeof nested.Info ===
        "object"
    ) {
      const info =
        nested.Info as Record<
          string,
          unknown
        >;

      const candidate =
        info.ID;

      if (
        typeof candidate ===
          "string" &&
        candidate
      ) {
        return candidate;
      }
    }
  }

  return null;
}

async function parseResponse(
  response: Response,
): Promise<unknown> {
  const text =
    await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text,
    };
  }
}

async function assertEvolutionResponse(
  response: Response,
): Promise<unknown> {
  const payload =
    await parseResponse(
      response,
    );

  if (!response.ok) {
    let detail =
      `Evolution API retornou HTTP ${response.status}.`;

    if (
      payload &&
      typeof payload ===
        "object"
    ) {
      const record =
        payload as Record<
          string,
          unknown
        >;

      const message =
        record.message ??
        record.error;

      if (
        typeof message ===
          "string"
      ) {
        detail = message;
      }
    }

    throw new MessagingProviderError(
      "evolution_request_failed",
      detail,
      response.status >= 500
        ? 502
        : response.status,
    );
  }

  return payload;
}

async function sendText(
  request:
    MessagingSendRequest,
  config:
    EvolutionMessagingConfig,
): Promise<string> {
  const text =
    request.text?.trim();

  if (!text) {
    throw new MessagingProviderError(
      "invalid_message",
      "Texto da mensagem é obrigatório.",
      400,
    );
  }

  if (
    request.replyToProviderMessageId
  ) {
    throw new MessagingProviderError(
      "evolution_quote_pending",
      "Resposta citada ainda não foi habilitada no adapter Evolution.",
      400,
    );
  }

  const url =
    `${normalizeBaseUrl(
      config.baseUrl,
    )}/message/sendText/${encodeURIComponent(
      config.instanceName,
    )}`;

  const response =
    await fetch(
      url,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          apikey:
            config.apiKey,
        },

        body:
          JSON.stringify({
            number:
              request.to,

            textMessage: {
              text,
            },
          }),
      },
    );

  const payload =
    await assertEvolutionResponse(
      response,
    );

  const id =
    extractProviderMessageId(
      payload,
    );

  if (!id) {
    throw new MessagingProviderError(
      "evolution_invalid_response",
      "Evolution enviou a mensagem, mas não retornou um identificador reconhecível.",
      502,
    );
  }

  return id;
}

async function sendMedia(
  request:
    MessagingSendRequest,
  config:
    EvolutionMessagingConfig,
): Promise<string> {
  if (!request.mediaUrl) {
    throw new MessagingProviderError(
      "invalid_message",
      "mediaUrl é obrigatório.",
      400,
    );
  }

  if (
    ![
      "image",
      "video",
      "audio",
      "document",
    ].includes(
      request.contentType,
    )
  ) {
    throw new MessagingProviderError(
      "unsupported_media_type",
      "Tipo de mídia não suportado.",
      400,
    );
  }

  /*
   * A API atual documenta upload
   * multipart/form-data.
   * O Zenith busca a URL de mídia
   * server-side e encaminha o arquivo.
   */
  const mediaResponse =
    await fetch(
      request.mediaUrl,
    );

  if (!mediaResponse.ok) {
    throw new MessagingProviderError(
      "media_download_failed",
      "Não foi possível obter a mídia para envio.",
      502,
    );
  }

  const blob =
    await mediaResponse.blob();

  const form =
    new FormData();

  form.append(
    "number",
    request.to,
  );

  form.append(
    "mediatype",
    request.contentType,
  );

  form.append(
    "media",
    blob,
    request.filename ??
      `zenith-${Date.now()}`,
  );

  if (request.text) {
    form.append(
      "caption",
      request.text,
    );
  }

  if (request.filename) {
    form.append(
      "fileName",
      request.filename,
    );
  }

  const url =
    `${normalizeBaseUrl(
      config.baseUrl,
    )}/message/sendMedia/${encodeURIComponent(
      config.instanceName,
    )}`;

  const response =
    await fetch(
      url,
      {
        method: "POST",

        headers: {
          apikey:
            config.apiKey,
        },

        body: form,
      },
    );

  const payload =
    await assertEvolutionResponse(
      response,
    );

  const id =
    extractProviderMessageId(
      payload,
    );

  if (!id) {
    throw new MessagingProviderError(
      "evolution_invalid_response",
      "Evolution não retornou um identificador reconhecível para a mídia.",
      502,
    );
  }

  return id;
}

export const evolutionMessagingProvider:
  MessagingProvider = {
  id: "evolution",

  capabilities:
    messagingCapabilities.evolution,

  async send(
    request,
    providerConfig,
  ): Promise<MessagingSendResult> {
    assertProviderCanSend(
      "evolution",
      request,
    );

    const config =
      requireEvolutionConfig(
        providerConfig,
      );

    let providerMessageId:
      string;

    if (
      request.contentType ===
      "text"
    ) {
      providerMessageId =
        await sendText(
          request,
          config,
        );
    } else if (
      request.contentType ===
        "image" ||
      request.contentType ===
        "video" ||
      request.contentType ===
        "audio" ||
      request.contentType ===
        "document"
    ) {
      providerMessageId =
        await sendMedia(
          request,
          config,
        );
    } else {
      throw new MessagingProviderError(
        "evolution_content_not_supported",
        `O tipo ${request.contentType} não está habilitado no adapter Evolution do Zenith CRM.`,
        400,
      );
    }

    return {
      provider:
        "evolution",

      providerMessageId,

      acceptedAt:
        new Date()
          .toISOString(),
    };
  },
};
