import {
  voiceCapabilities,
} from "../capabilities";

import {
  asteriskAriRequest,
} from "../asterisk-ari";

import type {
  AsteriskVoiceConfig,
  VoiceProvider,
  VoiceProviderConfig,
} from "../types";

import {
  VoiceProviderError,
} from "../types";

function requireAsteriskConfig(
  config:
    VoiceProviderConfig,
): AsteriskVoiceConfig {
  if (
    config.provider !==
    "asterisk"
  ) {
    throw new VoiceProviderError(
      "invalid_asterisk_config",
      "Configuracao Asterisk invalida.",
      500,
    );
  }

  if (!config.ariBaseUrl) {
    throw new VoiceProviderError(
      "asterisk_ari_url_missing",
      "ARI Base URL nao configurada.",
      400,
    );
  }

  if (
    !config.ariUsername ||
    !config.ariPassword
  ) {
    throw new VoiceProviderError(
      "asterisk_ari_credentials_missing",
      "Credenciais ARI nao configuradas.",
      400,
    );
  }

  if (!config.stasisApp) {
    throw new VoiceProviderError(
      "asterisk_stasis_app_missing",
      "Aplicacao Stasis nao configurada.",
      400,
    );
  }

  if (!config.trunkEndpoint) {
    throw new VoiceProviderError(
      "asterisk_trunk_missing",
      "Endpoint PJSIP do tronco nao configurado.",
      400,
    );
  }

  return config;
}

export const asteriskVoiceProvider:
  VoiceProvider = {
  id:
    "asterisk",

  capabilities:
    voiceCapabilities.asterisk,

  /*
   * Nao existe startCall aqui de proposito.
   *
   * O fluxo outbound sera:
   *
   * Browser SIP.js
   *   -> PJSIP/WSS
   *   -> Asterisk
   *   -> tronco PJSIP
   *
   * Evitamos originar uma perna PSTN sem
   * existir uma perna de audio do operador.
   */

  async acceptCall(
    request,
    providerConfig,
  ) {
    const config =
      requireAsteriskConfig(
        providerConfig,
      );

    await asteriskAriRequest(
      config,

      `/channels/${encodeURIComponent(
        request.providerCallId,
      )}/answer`,

      {
        method:
          "POST",
      },
    );
  },

  async rejectCall(
    request,
    providerConfig,
  ) {
    const config =
      requireAsteriskConfig(
        providerConfig,
      );

    await asteriskAriRequest(
      config,

      `/channels/${encodeURIComponent(
        request.providerCallId,
      )}`,

      {
        method:
          "DELETE",
      },
    );
  },

  async hangupCall(
    request,
    providerConfig,
  ) {
    const config =
      requireAsteriskConfig(
        providerConfig,
      );

    await asteriskAriRequest(
      config,

      `/channels/${encodeURIComponent(
        request.providerCallId,
      )}`,

      {
        method:
          "DELETE",
      },
    );
  },
};
