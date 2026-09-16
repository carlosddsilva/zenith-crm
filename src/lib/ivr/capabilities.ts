import type {
  IvrCapabilityId,
  IvrCapabilitySupport,
  IvrProviderId,
} from "./types";

export type IvrProviderCapabilityMatrix =
  Record<
    IvrCapabilityId,
    IvrCapabilitySupport
  >;

export const ivrCapabilities:
  Record<
    IvrProviderId,
    IvrProviderCapabilityMatrix
  > = {
  /*
   * WaCalls atual:
   *
   * Possui controle de chamada e WebRTC,
   * mas nao estamos declarando playback,
   * DTMF, TTS ou transferencia server-side
   * sem implementacao comprovada.
   */
  /*
   * WaCalls - capacidades confirmadas no
   * ambiente funcional usado como referencia.
   *
   * SUPORTADOS:
   * - Departamento / Fila (handoff humano)
   * - Horario
   * - Condicao
   * - Encerrar
   *
   * NAO SUPORTADOS:
   * - Entrada por voz
   * - Menu DTMF
   * - Transferencia
   *
   * PLANNED significa que o provider suporta,
   * mas o runtime correspondente do Zenith
   * ainda sera implementado.
   */
  wacalls: {
    "logic.condition":
      "ready",

    "time.business_hours":
      "ready",

    "call.answer":
      "ready",

    "call.hangup":
      "ready",

    /*
     * O gateway vendorizado neste SHA nao registra
     * POST .../playback. Manter como unsupported
     * impede publicar um fluxo que falharia ao vivo.
     */
    "audio.play":
      "unsupported",

    "tts.speak":
      "planned",

    "input.dtmf":
      "unsupported",

    "input.voice":
      "unsupported",

    "queue.route":
      "ready",

    "extension.route":
      "planned",

    "call.transfer":
      "unsupported",
  },
  asterisk: {
    "logic.condition":
      "ready",

    "time.business_hours":
      "ready",

    "call.answer":
      "ready",

    "call.hangup":
      "ready",

    "audio.play":
      "planned",

    "tts.speak":
      "planned",

    "input.dtmf":
      "planned",

    "input.voice":
      "planned",

    "queue.route":
      "planned",

    "extension.route":
      "planned",

    "call.transfer":
      "planned",
  },
};

export function getIvrCapabilitySupport(
  provider:
    IvrProviderId,

  capability:
    IvrCapabilityId,
) {
  return ivrCapabilities[
    provider
  ][capability];
}


