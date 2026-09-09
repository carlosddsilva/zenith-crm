import {
  ivrNodeCatalog,
} from "./nodes";

import type {
  IvrFlowDefinition,
  IvrFlowEdge,
  IvrFlowNode,
  IvrNodeType,
  IvrProviderId,
} from "./types";

export class IvrDefinitionError
  extends Error {
  constructor(
    message:
      string,
  ) {
    super(message);

    this.name =
      "IvrDefinitionError";
  }
}

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

function isProvider(
  value:
    unknown,
): value is IvrProviderId {
  return (
    value ===
      "wacalls" ||
    value ===
      "asterisk"
  );
}

function isNodeType(
  value:
    unknown,
): value is IvrNodeType {
  return (
    typeof value ===
      "string" &&
    Object.prototype
      .hasOwnProperty.call(
        ivrNodeCatalog,
        value,
      )
  );
}

export function parseIvrFlowDefinition(
  value:
    unknown,
): IvrFlowDefinition {
  if (!isRecord(value)) {
    throw new IvrDefinitionError(
      "Definicao do fluxo invalida.",
    );
  }

  if (
    !Array.isArray(
      value.nodes,
    ) ||
    !Array.isArray(
      value.edges,
    )
  ) {
    throw new IvrDefinitionError(
      "nodes e edges sao obrigatorios.",
    );
  }

  const nodes:
    IvrFlowNode[] =
    value.nodes.map(
      (
        raw,
        index,
      ) => {
        if (!isRecord(raw)) {
          throw new IvrDefinitionError(
            `Node ${index} invalido.`,
          );
        }

        if (
          typeof raw.id !==
            "string" ||
          !raw.id.trim()
        ) {
          throw new IvrDefinitionError(
            `Node ${index} sem ID valido.`,
          );
        }

        if (
          !isNodeType(
            raw.type,
          )
        ) {
          throw new IvrDefinitionError(
            `Tipo de node invalido: ${String(
              raw.type,
            )}.`,
          );
        }

        if (
          !isRecord(
            raw.position,
          ) ||
          typeof raw.position
            .x !== "number" ||
          typeof raw.position
            .y !== "number"
        ) {
          throw new IvrDefinitionError(
            `Posicao invalida no node ${raw.id}.`,
          );
        }

        return {
          id:
            raw.id,

          type:
            raw.type,

          position: {
            x:
              raw.position.x,

            y:
              raw.position.y,
          },

          data:
            isRecord(
              raw.data,
            )
              ? raw.data
              : {},
        };
      },
    );

  const edges:
    IvrFlowEdge[] =
    value.edges.map(
      (
        raw,
        index,
      ) => {
        if (!isRecord(raw)) {
          throw new IvrDefinitionError(
            `Edge ${index} invalida.`,
          );
        }

        if (
          typeof raw.id !==
            "string" ||
          typeof raw.source !==
            "string" ||
          typeof raw.target !==
            "string"
        ) {
          throw new IvrDefinitionError(
            `Edge ${index} invalida.`,
          );
        }

        return {
          id:
            raw.id,

          source:
            raw.source,

          target:
            raw.target,

          sourceHandle:
            typeof raw.sourceHandle ===
              "string"
              ? raw.sourceHandle
              : null,

          targetHandle:
            typeof raw.targetHandle ===
              "string"
              ? raw.targetHandle
              : null,

          label:
            typeof raw.label ===
              "string"
              ? raw.label
              : null,
        };
      },
    );

  let viewport:
    IvrFlowDefinition[
      "viewport"
    ];

  if (
    value.viewport !==
    undefined
  ) {
    if (
      !isRecord(
        value.viewport,
      ) ||
      typeof value.viewport.x !==
        "number" ||
      typeof value.viewport.y !==
        "number" ||
      typeof value.viewport.zoom !==
        "number"
    ) {
      throw new IvrDefinitionError(
        "Viewport invalido.",
      );
    }

    viewport = {
      x:
        value.viewport.x,

      y:
        value.viewport.y,

      zoom:
        value.viewport.zoom,
    };
  }

  const settings:
    NonNullable<
      IvrFlowDefinition[
        "settings"
      ]
    > = {};

  if (
    value.settings !==
    undefined
  ) {
    if (
      !isRecord(
        value.settings,
      )
    ) {
      throw new IvrDefinitionError(
        "Settings invalido.",
      );
    }

    Object.assign(
      settings,
      value.settings,
    );

    if (
      value.settings
        .providers !==
      undefined
    ) {
      if (
        !Array.isArray(
          value.settings
            .providers,
        ) ||
        !value.settings
          .providers
          .every(
            isProvider,
          )
      ) {
        throw new IvrDefinitionError(
          "Lista de providers invalida.",
        );
      }

      settings.providers =
        [
          ...new Set(
            value.settings
              .providers,
          ),
        ];
    }

    if (
      value.settings
        .maxSteps !==
        undefined
    ) {
      if (
        !Number.isInteger(
          value.settings
            .maxSteps,
        ) ||
        Number(
          value.settings
            .maxSteps,
        ) < 1
      ) {
        throw new IvrDefinitionError(
          "maxSteps deve ser inteiro >= 1.",
        );
      }

      settings.maxSteps =
        Number(
          value.settings
            .maxSteps,
        );
    }
  }

  return {
    nodes,
    edges,

    ...(viewport
      ? {
          viewport,
        }
      : {}),

    settings,
  };
}

export function getIvrDefinitionProviders(
  definition:
    IvrFlowDefinition,
): IvrProviderId[] {
  return (
    definition.settings
      ?.providers ??
    []
  );
}
