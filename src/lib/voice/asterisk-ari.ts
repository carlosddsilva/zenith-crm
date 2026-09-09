import type {
  AsteriskVoiceConfig,
} from "./types";

import {
  VoiceProviderError,
} from "./types";

function basicAuth(
  username:
    string,

  password:
    string,
) {
  return (
    "Basic " +
    Buffer.from(
      `${username}:${password}`,
      "utf8",
    ).toString(
      "base64",
    )
  );
}

export function asteriskAriUrl(
  config:
    AsteriskVoiceConfig,

  path:
    string,
) {
  return (
    config.ariBaseUrl
      .replace(
        /\/+$/,
        "",
      ) +
    "/ari" +
    path
  );
}

export async function asteriskAriRequest(
  config:
    AsteriskVoiceConfig,

  path:
    string,

  options:
    RequestInit = {},
) {
  let response:
    Response;

  try {
    response =
      await fetch(
        asteriskAriUrl(
          config,
          path,
        ),
        {
          ...options,

          cache:
            "no-store",

          headers: {
            Authorization:
              basicAuth(
                config.ariUsername,
                config.ariPassword,
              ),

            ...(options.headers ??
              {}),
          },
        },
      );
  } catch (error) {
    throw new VoiceProviderError(
      "asterisk_unreachable",
      error instanceof Error
        ? `Asterisk ARI indisponivel: ${error.message}`
        : "Asterisk ARI indisponivel.",
      502,
    );
  }

  const text =
    await response.text();

  let payload:
    unknown = null;

  if (text) {
    try {
      payload =
        JSON.parse(text);
    } catch {
      payload = {
        raw:
          text,
      };
    }
  }

  if (!response.ok) {
    let message =
      `Asterisk ARI retornou HTTP ${response.status}.`;

    if (
      payload &&
      typeof payload ===
        "object" &&
      "message" in payload &&
      typeof (
        payload as {
          message?: unknown;
        }
      ).message === "string"
    ) {
      message =
        (
          payload as {
            message: string;
          }
        ).message;
    }

    throw new VoiceProviderError(
      "asterisk_ari_error",
      message,
      response.status >= 500
        ? 502
        : response.status,
    );
  }

  return payload;
}
