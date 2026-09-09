import type {
  IvrNodeDefinition,
  IvrNodeType,
} from "./types";

export const ivrNodeCatalog:
  Record<
    IvrNodeType,
    IvrNodeDefinition
  > = {
  "trigger.inbound": {
    type:
      "trigger.inbound",

    label:
      "Inicio",

    description:
      "Inicio de uma chamada inbound.",

    category:
      "trigger",

    requiredCapabilities:
      [],

    outputMode:
      "single",
  },

  "call.answer": {
    type:
      "call.answer",

    label:
      "Atender",

    description:
      "Atende a chamada recebida.",

    category:
      "call",

    requiredCapabilities: [
      "call.answer",
    ],

    outputMode:
      "single",
  },

  "audio.play": {
    type:
      "audio.play",

    label:
      "Audio",

    description:
      "Reproduz um arquivo de audio na chamada.",

    category:
      "media",

    requiredCapabilities: [
      "audio.play",
    ],

    outputMode:
      "single",
  },

  "tts.speak": {
    type:
      "tts.speak",

    label:
      "Texto (TTS)",

    description:
      "Converte texto em audio e reproduz na chamada.",

    category:
      "media",

    requiredCapabilities: [
      "tts.speak",
    ],

    outputMode:
      "single",
  },

  "input.dtmf": {
    type:
      "input.dtmf",

    label:
      "Menu DTMF",

    description:
      "Aguarda uma opcao digitada pelo cliente.",

    category:
      "input",

    requiredCapabilities: [
      "input.dtmf",
    ],

    /*
     * As saidas dependem das opcoes
     * configuradas no node.
     */
    outputMode:
      "dynamic",
  },

  "input.voice": {
    type:
      "input.voice",

    label:
      "Entrada por voz",

    description:
      "Captura uma resposta de voz para processamento.",

    category:
      "input",

    requiredCapabilities: [
      "input.voice",
    ],

    outputMode:
      "dynamic",
  },

  "time.business_hours": {
    type:
      "time.business_hours",

    label:
      "Horario de atendimento",

    description:
      "Desvia o fluxo conforme horario comercial.",

    category:
      "logic",

    requiredCapabilities: [
      "time.business_hours",
    ],

    outputMode:
      "branches",

    outputs: [
      {
        id:
          "open",

        label:
          "Aberto",
      },

      {
        id:
          "closed",

        label:
          "Fechado",
      },
    ],
  },

  "logic.condition": {
    type:
      "logic.condition",

    label:
      "Condicao",

    description:
      "Executa uma decisao logica no fluxo.",

    category:
      "logic",

    requiredCapabilities: [
      "logic.condition",
    ],

    outputMode:
      "branches",

    outputs: [
      {
        id:
          "true",

        label:
          "Sim",
      },

      {
        id:
          "false",

        label:
          "Nao",
      },
    ],
  },

  "queue.route": {
    type:
      "queue.route",

    label:
      "Departamento / Fila",

    description:
      "Encaminha a chamada para uma fila ou departamento.",

    category:
      "routing",

    requiredCapabilities: [
      "queue.route",
    ],

    outputMode:
      "branches",

    outputs: [
      {
        id:
          "answered",

        label:
          "Atendida",
      },

      {
        id:
          "timeout",

        label:
          "Sem atendimento",
      },

      {
        id:
          "unavailable",

        label:
          "Indisponivel",
      },
    ],
  },

  "extension.route": {
    type:
      "extension.route",

    label:
      "Ramal",

    description:
      "Encaminha a chamada para um ramal ou operador.",

    category:
      "routing",

    requiredCapabilities: [
      "extension.route",
    ],

    outputMode:
      "branches",

    outputs: [
      {
        id:
          "answered",

        label:
          "Atendida",
      },

      {
        id:
          "unavailable",

        label:
          "Indisponivel",
      },
    ],
  },

  "call.transfer": {
    type:
      "call.transfer",

    label:
      "Transferencia",

    description:
      "Transfere a chamada para outro destino.",

    category:
      "routing",

    requiredCapabilities: [
      "call.transfer",
    ],

    outputMode:
      "single",
  },

  "call.hangup": {
    type:
      "call.hangup",

    label:
      "Encerrar",

    description:
      "Encerra a chamada.",

    category:
      "call",

    requiredCapabilities: [
      "call.hangup",
    ],

    outputMode:
      "none",
  },
};

export function getIvrNodeDefinition(
  type:
    IvrNodeType,
) {
  return ivrNodeCatalog[
    type
  ];
}
