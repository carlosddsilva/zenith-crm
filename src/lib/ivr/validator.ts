import {
  getIvrCapabilitySupport,
} from "./capabilities";

import {
  getIvrNodeDefinition,
} from "./nodes";

import type {
  IvrFlowDefinition,
  IvrFlowNode,
  IvrProviderId,
  IvrValidationIssue,
  IvrValidationResult,
} from "./types";

function isRecord(
  value:
    unknown,
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(
      value,
    )
  );
}

function textValue(
  node:
    IvrFlowNode,

  key:
    string,
) {
  const value =
    node.data[key];

  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function numberValue(
  node:
    IvrFlowNode,

  key:
    string,
) {
  const value =
    node.data[key];

  return typeof value ===
      "number" &&
    Number.isFinite(
      value,
    )
    ? value
    : null;
}

function pushNodeError(
  errors:
    IvrValidationIssue[],

  node:
    IvrFlowNode,

  code:
    string,

  message:
    string,
) {
  errors.push({
    severity:
      "error",

    code,

    nodeId:
      node.id,

    message,
  });
}

function validateNodeConfig(
  node:
    IvrFlowNode,

  errors:
    IvrValidationIssue[],

  warnings:
    IvrValidationIssue[],
) {
  switch (
    node.type
  ) {
    case "trigger.inbound":
    case "call.answer":
      return;

    case "audio.play": {
      /*
       * Hoje aceitamos audioUrl.
       *
       * A proxima etapa adicionara
       * audioAssetId para a biblioteca
       * de WAV do Zenith.
       */
      const audioUrl =
        textValue(
          node,
          "audioUrl",
        );

      const audioAssetId =
        textValue(
          node,
          "audioAssetId",
        );

      if (
        !audioUrl &&
        !audioAssetId
      ) {
        pushNodeError(
          errors,
          node,
          "audio_source_required",
          'O bloco "Audio" precisa de um arquivo WAV.',
        );
      }

      return;
    }

    case "tts.speak": {
      const text =
        textValue(
          node,
          "text",
        );

      if (!text) {
        pushNodeError(
          errors,
          node,
          "tts_text_required",
          'O bloco "Texto (TTS)" precisa de um texto.',
        );
      }

      if (
        text.length >
        5000
      ) {
        pushNodeError(
          errors,
          node,
          "tts_text_too_long",
          "O texto TTS deve possuir no maximo 5000 caracteres.",
        );
      }

      return;
    }

    case "input.dtmf": {
      const timeout =
        numberValue(
          node,
          "timeoutSeconds",
        );

      if (
        timeout ===
          null ||
        timeout < 1 ||
        timeout > 60
      ) {
        pushNodeError(
          errors,
          node,
          "dtmf_timeout_invalid",
          "O timeout do Menu DTMF deve estar entre 1 e 60 segundos.",
        );
      }

      if (
        !Array.isArray(
          node.data.options,
        ) ||
        node.data.options
          .length ===
          0
      ) {
        pushNodeError(
          errors,
          node,
          "dtmf_options_required",
          "O Menu DTMF precisa possuir pelo menos uma opcao.",
        );

        return;
      }

      const digits =
        new Set<
          string
        >();

      for (
        const option of
          node.data.options
      ) {
        if (
          !isRecord(
            option,
          )
        ) {
          pushNodeError(
            errors,
            node,
            "dtmf_option_invalid",
            "Existe uma opcao DTMF invalida.",
          );

          continue;
        }

        const digit =
          typeof option.digit ===
            "string"
            ? option.digit
                .trim()
            : "";

        if (
          !/^[0-9*#]$/.test(
            digit,
          )
        ) {
          pushNodeError(
            errors,
            node,
            "dtmf_digit_invalid",
            `A opcao DTMF "${digit || "vazia"}" e invalida.`,
          );

          continue;
        }

        if (
          digits.has(
            digit,
          )
        ) {
          pushNodeError(
            errors,
            node,
            "dtmf_digit_duplicate",
            `A tecla DTMF "${digit}" esta configurada mais de uma vez.`,
          );
        }

        digits.add(
          digit,
        );
      }

      return;
    }

    case "input.voice": {
      const maxSeconds =
        numberValue(
          node,
          "maxSeconds",
        );

      if (
        maxSeconds ===
          null ||
        maxSeconds < 1 ||
        maxSeconds > 120
      ) {
        pushNodeError(
          errors,
          node,
          "voice_input_duration_invalid",
          "A captura de voz deve estar entre 1 e 120 segundos.",
        );
      }

      return;
    }

    case "time.business_hours": {
      const timezone =
        textValue(
          node,
          "timezone",
        );

      if (!timezone) {
        pushNodeError(
          errors,
          node,
          "business_hours_timezone_required",
          "Informe o fuso horario.",
        );
      }

      const weekdays =
        node.data.weekdays;

      if (
        !Array.isArray(
          weekdays,
        ) ||
        weekdays.length ===
          0
      ) {
        pushNodeError(
          errors,
          node,
          "business_hours_days_required",
          "Selecione pelo menos um dia de atendimento.",
        );
      }

      const start =
        textValue(
          node,
          "startTime",
        );

      const end =
        textValue(
          node,
          "endTime",
        );

      const timeRegex =
        /^([01]\d|2[0-3]):[0-5]\d$/;

      if (
        !timeRegex.test(
          start,
        )
      ) {
        pushNodeError(
          errors,
          node,
          "business_hours_start_invalid",
          "O horario inicial e invalido.",
        );
      }

      if (
        !timeRegex.test(
          end,
        )
      ) {
        pushNodeError(
          errors,
          node,
          "business_hours_end_invalid",
          "O horario final e invalido.",
        );
      }

      if (
        start &&
        end &&
        start ===
          end
      ) {
        pushNodeError(
          errors,
          node,
          "business_hours_range_invalid",
          "O horario inicial e final nao podem ser iguais.",
        );
      }

      return;
    }

    case "logic.condition": {
      const variable =
        textValue(
          node,
          "variable",
        );

      const operator =
        textValue(
          node,
          "operator",
        );

      if (!variable) {
        pushNodeError(
          errors,
          node,
          "condition_variable_required",
          "Informe a variavel da condicao.",
        );
      }

      const allowedOperators =
        new Set([
          "equals",
          "not_equals",
          "contains",
          "exists",
          "greater_than",
          "less_than",
        ]);

      if (
        !allowedOperators.has(
          operator,
        )
      ) {
        pushNodeError(
          errors,
          node,
          "condition_operator_invalid",
          "O operador da condicao e invalido.",
        );
      }

      if (
        operator !==
          "exists" &&
        !textValue(
          node,
          "value",
        )
      ) {
        pushNodeError(
          errors,
          node,
          "condition_value_required",
          "Informe o valor da condicao.",
        );
      }

      return;
    }

    case "queue.route": {
      if (
        !textValue(
          node,
          "queueKey",
        )
      ) {
        pushNodeError(
          errors,
          node,
          "queue_required",
          "Selecione um departamento ou fila.",
        );
      }

      const timeout =
        numberValue(
          node,
          "timeoutSeconds",
        );

      if (
        timeout ===
          null ||
        timeout < 1 ||
        timeout > 3600
      ) {
        pushNodeError(
          errors,
          node,
          "queue_timeout_invalid",
          "O timeout da fila deve estar entre 1 e 3600 segundos.",
        );
      }

      return;
    }

    case "extension.route": {
      if (
        !textValue(
          node,
          "extension",
        )
      ) {
        pushNodeError(
          errors,
          node,
          "extension_required",
          "Informe o ramal de destino.",
        );
      }

      const timeout =
        numberValue(
          node,
          "timeoutSeconds",
        );

      if (
        timeout ===
          null ||
        timeout < 1 ||
        timeout > 3600
      ) {
        pushNodeError(
          errors,
          node,
          "extension_timeout_invalid",
          "O timeout do ramal deve estar entre 1 e 3600 segundos.",
        );
      }

      return;
    }

    case "call.transfer": {
      if (
        !textValue(
          node,
          "destination",
        )
      ) {
        pushNodeError(
          errors,
          node,
          "transfer_destination_required",
          "Informe o destino da transferencia.",
        );
      }

      return;
    }

    case "call.hangup": {
      const reason =
        textValue(
          node,
          "reason",
        ) ||
        "normal";

      if (
        ![
          "normal",
          "busy",
          "rejected",
        ].includes(
          reason,
        )
      ) {
        pushNodeError(
          errors,
          node,
          "hangup_reason_invalid",
          "O motivo de encerramento e invalido.",
        );
      }

      return;
    }

    default: {
      warnings.push({
        severity:
          "warning",

        code:
          "node_config_unknown",

        nodeId:
          node.id,

        message:
          `Nao existe validacao de propriedades para o bloco ${node.type}.`,
      });
    }
  }
}

export function validateIvrFlow(
  definition:
    IvrFlowDefinition,

  providers:
    IvrProviderId[],
): IvrValidationResult {
  const errors:
    IvrValidationIssue[] = [];

  const warnings:
    IvrValidationIssue[] = [];

  if (
    !Array.isArray(
      definition.nodes,
    ) ||
    definition.nodes.length ===
      0
  ) {
    errors.push({
      severity:
        "error",

      code:
        "flow_empty",

      message:
        "O fluxo nao possui blocos.",
    });

    return {
      valid:
        false,

      errors,

      warnings,
    };
  }

  if (
    !Array.isArray(
      definition.edges,
    )
  ) {
    errors.push({
      severity:
        "error",

      code:
        "edges_invalid",

      message:
        "A lista de conexoes do fluxo e invalida.",
    });

    return {
      valid:
        false,

      errors,

      warnings,
    };
  }

  if (
    providers.length ===
    0
  ) {
    errors.push({
      severity:
        "error",

      code:
        "providers_empty",

      message:
        "Selecione pelo menos um provider de voz.",
    });
  }

  const uniqueProviders =
    [
      ...new Set(
        providers,
      ),
    ];

  const nodeIds =
    new Set<
      string
    >();

  for (
    const node of
      definition.nodes
  ) {
    if (!node.id) {
      errors.push({
        severity:
          "error",

        code:
          "node_id_missing",

        message:
          "Existe um bloco sem ID.",
      });

      continue;
    }

    if (
      nodeIds.has(
        node.id,
      )
    ) {
      errors.push({
        severity:
          "error",

        code:
          "node_id_duplicate",

        nodeId:
          node.id,

        message:
          `ID de bloco duplicado: ${node.id}.`,
      });
    }

    nodeIds.add(
      node.id,
    );

    /*
     * Valida as propriedades especificas
     * do node antes da publicacao.
     */
    validateNodeConfig(
      node,
      errors,
      warnings,
    );
  }

  const startNodes =
    definition.nodes.filter(
      (
        node,
      ) =>
        node.type ===
        "trigger.inbound",
    );

  if (
    startNodes.length ===
    0
  ) {
    errors.push({
      severity:
        "error",

      code:
        "start_missing",

      message:
        "O fluxo precisa de um bloco Inicio.",
    });
  }

  if (
    startNodes.length >
    1
  ) {
    errors.push({
      severity:
        "error",

      code:
        "start_multiple",

      message:
        "O fluxo pode possuir apenas um bloco Inicio.",
    });
  }

  const edgeIds =
    new Set<
      string
    >();

  const incoming =
    new Map<
      string,
      number
    >();

  const outgoing =
    new Map<
      string,
      number
    >();

  const outgoingHandles =
    new Map<
      string,
      Set<
        string
      >
    >();

  for (
    const edge of
      definition.edges
  ) {
    if (!edge.id) {
      errors.push({
        severity:
          "error",

        code:
          "edge_id_missing",

        message:
          "Existe uma conexao sem ID.",
      });

      continue;
    }

    if (
      edgeIds.has(
        edge.id,
      )
    ) {
      errors.push({
        severity:
          "error",

        code:
          "edge_id_duplicate",

        edgeId:
          edge.id,

        message:
          `ID de conexao duplicado: ${edge.id}.`,
      });
    }

    edgeIds.add(
      edge.id,
    );

    if (
      !nodeIds.has(
        edge.source,
      )
    ) {
      errors.push({
        severity:
          "error",

        code:
          "edge_source_missing",

        edgeId:
          edge.id,

        message:
          `A origem ${edge.source} nao existe.`,
      });
    }

    if (
      !nodeIds.has(
        edge.target,
      )
    ) {
      errors.push({
        severity:
          "error",

        code:
          "edge_target_missing",

        edgeId:
          edge.id,

        message:
          `O destino ${edge.target} nao existe.`,
      });
    }

    outgoing.set(
      edge.source,

      (
        outgoing.get(
          edge.source,
        ) ??
        0
      ) + 1,
    );

    incoming.set(
      edge.target,

      (
        incoming.get(
          edge.target,
        ) ??
        0
      ) + 1,
    );

    if (
      edge.sourceHandle
    ) {
      const handles =
        outgoingHandles.get(
          edge.source,
        ) ??
        new Set<
          string
        >();

      handles.add(
        edge.sourceHandle,
      );

      outgoingHandles.set(
        edge.source,
        handles,
      );
    }
  }

  for (
    const node of
      definition.nodes
  ) {
    const nodeDefinition =
      getIvrNodeDefinition(
        node.type,
      );

    /*
     * Capability matrix:
     * READY publica.
     * PLANNED/UNSUPPORTED bloqueiam.
     */
    for (
      const provider of
        uniqueProviders
    ) {
      for (
        const capability of
          nodeDefinition
            .requiredCapabilities
      ) {
        const support =
          getIvrCapabilitySupport(
            provider,
            capability,
          );

        if (
          support ===
          "ready"
        ) {
          continue;
        }

        errors.push({
          severity:
            "error",

          code:
            support ===
            "planned"
              ? "capability_planned"
              : "capability_unsupported",

          nodeId:
            node.id,

          provider,

          capability,

          message:
            support ===
            "planned"
              ? `O bloco "${nodeDefinition.label}" ainda nao esta implementado no runtime ${provider}.`
              : `O bloco "${nodeDefinition.label}" nao e suportado pelo provider ${provider}.`,
        });
      }
    }

    const incomingCount =
      incoming.get(
        node.id,
      ) ??
      0;

    const outgoingCount =
      outgoing.get(
        node.id,
      ) ??
      0;

    if (
      node.type !==
        "trigger.inbound" &&
      incomingCount ===
        0
    ) {
      warnings.push({
        severity:
          "warning",

        code:
          "node_unreachable",

        nodeId:
          node.id,

        message:
          `O bloco "${nodeDefinition.label}" nao possui entrada.`,
      });
    }

    if (
      nodeDefinition
        .outputMode ===
        "none" &&
      outgoingCount >
        0
    ) {
      errors.push({
        severity:
          "error",

        code:
          "terminal_has_output",

        nodeId:
          node.id,

        message:
          `O bloco "${nodeDefinition.label}" e terminal e nao pode possuir saida.`,
      });
    }

    if (
      nodeDefinition
        .outputMode ===
        "single"
    ) {
      if (
        outgoingCount ===
        0
      ) {
        warnings.push({
          severity:
            "warning",

          code:
            "node_without_output",

          nodeId:
            node.id,

          message:
            `O bloco "${nodeDefinition.label}" nao possui destino.`,
        });
      }

      if (
        outgoingCount >
        1
      ) {
        errors.push({
          severity:
            "error",

          code:
            "single_output_multiple_edges",

          nodeId:
            node.id,

          message:
            `O bloco "${nodeDefinition.label}" permite somente uma saida.`,
        });
      }
    }

    /*
     * Nodes com handles fixos:
     * Condicao, horario, fila, ramal etc.
     */
    if (
      nodeDefinition.outputs &&
      nodeDefinition.outputs
        .length >
        0
    ) {
      const connected =
        outgoingHandles.get(
          node.id,
        ) ??
        new Set<
          string
        >();

      for (
        const output of
          nodeDefinition.outputs
      ) {
        if (
          !connected.has(
            output.id,
          )
        ) {
          errors.push({
            severity:
              "error",

            code:
              "branch_not_connected",

            nodeId:
              node.id,

            message:
              `A saida "${output.label}" do bloco "${nodeDefinition.label}" nao esta conectada.`,
          });
        }
      }
    }

    /*
     * Menu DTMF possui handles dinamicos.
     */
    if (
      node.type ===
        "input.dtmf" &&
      Array.isArray(
        node.data.options,
      )
    ) {
      const connected =
        outgoingHandles.get(
          node.id,
        ) ??
        new Set<
          string
        >();

      for (
        const rawOption of
          node.data.options
      ) {
        if (
          !isRecord(
            rawOption,
          ) ||
          typeof rawOption.digit !==
            "string"
        ) {
          continue;
        }

        const digit =
          rawOption.digit
            .trim();

        if (!digit) {
          continue;
        }

        const handle =
          `digit:${digit}`;

        if (
          !connected.has(
            handle,
          )
        ) {
          errors.push({
            severity:
              "error",

            code:
              "dtmf_branch_not_connected",

            nodeId:
              node.id,

            message:
              `A opcao DTMF "${digit}" nao esta conectada a outro bloco.`,
          });
        }
      }
    }
  }

  const hasTerminal =
    definition.nodes.some(
      (
        node,
      ) =>
        node.type ===
        "call.hangup",
    );

  if (!hasTerminal) {
    warnings.push({
      severity:
        "warning",

      code:
        "hangup_missing",

      message:
        "O fluxo nao possui um bloco Encerrar.",
    });
  }

  return {
    valid:
      errors.length ===
      0,

    errors,

    warnings,
  };
}
