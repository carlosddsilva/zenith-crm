import type {
  VoiceProviderCapabilities,
  VoiceProviderId,
} from "./types";

export const voiceCapabilities:
  Record<
    VoiceProviderId,
    VoiceProviderCapabilities
  > = {
  wacalls: {
    inboundCalls:
      true,

    outboundCalls:
      true,

    browserWebRtc:
      true,

    browserMediaMode:
      "provider_sdp",

    outboundStartMode:
      "server",

    acceptCall:
      true,

    rejectCall:
      true,

    hangupCall:
      true,

    recording:
      false,

    hold:
      false,

    mute:
      false,

    dtmf:
      false,

    serverPlayback:
      false,

    serverTts:
      false,
  },

  asterisk: {
    inboundCalls:
      true,

    outboundCalls:
      true,

    browserWebRtc:
      true,

    /*
     * Browser registra diretamente
     * no Asterisk usando PJSIP/WSS.
     */
    browserMediaMode:
      "sip_wss",

    /*
     * A chamada telefonica nasce no
     * cliente SIP do navegador.
     */
    outboundStartMode:
      "browser_sip",

    acceptCall:
      true,

    rejectCall:
      true,

    hangupCall:
      true,

    /*
     * O Asterisk suporta estes recursos.
     * Habilitaremos na UI conforme os
     * endpoints Zenith forem implementados.
     */
    recording:
      true,

    hold:
      true,

    mute:
      true,

    dtmf:
      true,

    serverPlayback:
      true,

    serverTts:
      false,
  },
};
