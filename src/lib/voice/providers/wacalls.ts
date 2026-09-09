import {
  voiceCapabilities,
} from "../capabilities";

import type {
  VoiceProvider,
  VoiceProviderConfig,
  WaCallsVoiceConfig,
} from "../types";

import {
  VoiceProviderError,
} from "../types";

function requireConfig(
  config:
    VoiceProviderConfig,
): WaCallsVoiceConfig {
  if (
    config.provider !==
    "wacalls"
  ) {
    throw new VoiceProviderError(
      "invalid_wacalls_config",
      "Configuracao WaCalls invalida.",
      500,
    );
  }

  if (!config.baseUrl) {
    throw new VoiceProviderError(
      "wacalls_base_url_missing",
      "URL do WaCalls nao configurada.",
      400,
    );
  }

  if (!config.sessionId) {
    throw new VoiceProviderError(
      "wacalls_session_missing",
      "Session ID do WaCalls nao configurado.",
      400,
    );
  }

  return config;
}

function baseUrl(
  config:
    WaCallsVoiceConfig,
) {
  return config.baseUrl
    .replace(
      /\/+$/,
      "",
    );
}

function sessionUrl(
  config:
    WaCallsVoiceConfig,
) {
  return (
    `${baseUrl(config)}` +
    `/api/sessions/` +
    encodeURIComponent(
      config.sessionId,
    )
  );
}

async function parseResponse(
  response:
    Response,
): Promise<unknown> {
  const text =
    await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(
      text,
    );
  } catch {
    return {
      raw: text,
    };
  }
}

function upstreamMessage(
  payload:
    unknown,
  fallback:
    string,
) {
  if (
    payload &&
    typeof payload ===
      "object" &&
    "error" in payload &&
    typeof (
      payload as {
        error?: unknown;
      }
    ).error === "string"
  ) {
    return (
      payload as {
        error: string;
      }
    ).error;
  }

  return fallback;
}

async function requestWaCalls(
  url:
    string,

  options:
    RequestInit,

  clientId:
    string,
) {
  let response:
    Response;

  try {
    response =
      await fetch(
        url,
        {
          ...options,

          cache:
            "no-store",

          headers: {
            ...(options.body
              ? {
                  "Content-Type":
                    "application/json",
                }
              : {}),

            "X-Client-Id":
              clientId,

            ...(options.headers ??
              {}),
          },
        },
      );
  } catch (error) {
    throw new VoiceProviderError(
      "wacalls_unreachable",
      error instanceof Error
        ? `WaCalls indisponivel: ${error.message}`
        : "WaCalls indisponivel.",
      502,
    );
  }

  const payload =
    await parseResponse(
      response,
    );

  if (!response.ok) {
    const message =
      upstreamMessage(
        payload,
        `WaCalls retornou HTTP ${response.status}.`,
      );

    /*
     * Mantemos conflitos e limites
     * semanticamente equivalentes.
     */
    const status =
      response.status === 409 ||
      response.status === 404 ||
      response.status === 429 ||
      response.status === 503
        ? response.status
        : response.status >= 500
          ? 502
          : response.status;

    throw new VoiceProviderError(
      "wacalls_request_failed",
      message,
      status,
    );
  }

  return payload;
}

export const waCallsVoiceProvider:
  VoiceProvider = {
  id:
    "wacalls",

  capabilities:
    voiceCapabilities.wacalls,

  async startCall(
    request,
    providerConfig,
  ) {
    const config =
      requireConfig(
        providerConfig,
      );

    const payload =
      await requestWaCalls(
        `${sessionUrl(config)}/calls`,

        {
          method:
            "POST",

          body:
            JSON.stringify({
              phone:
                request.to,
            }),
        },

        request.clientId,
      );

    const callId =
      (
        payload as {
          call?: {
            callId?:
              unknown;
          };
        } | null
      )?.call?.callId;

    if (
      typeof callId !==
        "string" ||
      !callId
    ) {
      throw new VoiceProviderError(
        "wacalls_invalid_start_response",
        "WaCalls nao retornou call.callId.",
        502,
      );
    }

    return {
      providerCallId:
        callId,

      /*
       * O proprio WaCalls registra
       * a chamada outbound inicialmente
       * como ringing.
       */
      state:
        "ringing",
    };
  },

  async exchangeWebRtc(
    request,
    providerConfig,
  ) {
    const config =
      requireConfig(
        providerConfig,
      );

    const payload =
      await requestWaCalls(
        `${sessionUrl(config)}/calls/${encodeURIComponent(
          request.providerCallId,
        )}/webrtc`,

        {
          method:
            "POST",

          body:
            JSON.stringify({
              sdp_offer:
                request.sdpOffer,
            }),
        },

        request.clientId,
      );

    const answer =
      (
        payload as {
          sdp_answer?:
            unknown;
        } | null
      )?.sdp_answer;

    if (
      typeof answer !==
        "string" ||
      !answer
    ) {
      throw new VoiceProviderError(
        "wacalls_invalid_webrtc_response",
        "WaCalls nao retornou sdp_answer.",
        502,
      );
    }

    return {
      sdpAnswer:
        answer,
    };
  },

  async playAudio(
    request,
    providerConfig,
  ) {
    const config =
      requireConfig(
        providerConfig,
      );

    const audioUrl =
      request.audioUrl
        .trim();

    if (!audioUrl) {
      throw new VoiceProviderError(
        "wacalls_audio_url_missing",
        "URL do audio nao informada.",
        400,
      );
    }

    let parsedUrl:
      URL;

    try {
      parsedUrl =
        new URL(
          audioUrl,
        );
    } catch {
      throw new VoiceProviderError(
        "wacalls_audio_url_invalid",
        "URL do audio invalida.",
        400,
      );
    }

    if (
      parsedUrl.protocol !==
        "http:" &&
      parsedUrl.protocol !==
        "https:"
    ) {
      throw new VoiceProviderError(
        "wacalls_audio_protocol_invalid",
        "O playback aceita somente URLs HTTP ou HTTPS.",
        400,
      );
    }

    const playbackId =
      request.playbackId
        ?.trim() ||
      crypto.randomUUID();

    await requestWaCalls(
      `${sessionUrl(config)}/calls/${encodeURIComponent(
        request.providerCallId,
      )}/playback`,

      {
        method:
          "POST",

        headers:
          config.apiKey
            ? {
                "X-API-Key":
                  config.apiKey,
              }
            : undefined,

        body:
          JSON.stringify({
            playbackId,

            url:
              audioUrl,
          }),
      },

      request.clientId,
    );

    return {
      playbackId,
    };
  },
  async acceptCall(
    request,
    providerConfig,
  ) {
    const config =
      requireConfig(
        providerConfig,
      );

    await requestWaCalls(
      `${sessionUrl(config)}/calls/${encodeURIComponent(
        request.providerCallId,
      )}/accept`,

      {
        method:
          "POST",
      },

      request.clientId,
    );
  },

  async rejectCall(
    request,
    providerConfig,
  ) {
    const config =
      requireConfig(
        providerConfig,
      );

    await requestWaCalls(
      `${sessionUrl(config)}/calls/${encodeURIComponent(
        request.providerCallId,
      )}/reject`,

      {
        method:
          "POST",
      },

      request.clientId,
    );
  },

  async hangupCall(
    request,
    providerConfig,
  ) {
    const config =
      requireConfig(
        providerConfig,
      );

    await requestWaCalls(
      `${sessionUrl(config)}/calls/${encodeURIComponent(
        request.providerCallId,
      )}`,

      {
        method:
          "DELETE",
      },

      request.clientId,
    );
  },
};

