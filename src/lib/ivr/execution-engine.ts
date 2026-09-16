import {
  and,
  desc,
  eq,
} from "drizzle-orm";

import {
  db,
} from "@/lib/db/client";

import {
  ivrExecutions,
  ivrExecutionSteps,
  ivrFlowVersions,
} from "@/lib/db/schema";

import type {
  VoiceProviderConfig,
} from "@/lib/voice/types";

import {
  getIvrRuntime,
} from "./runtimes";

import type {
  IvrRuntimeContext,
  IvrRuntimeResult,
} from "./runtime";

import type {
  IvrFlowDefinition,
  IvrFlowNode,
  IvrProviderId,
} from "./types";

export class IvrExecutionEngineError
  extends Error {
  constructor(
    public code:
      string,

    message:
      string,

    public status:
      number = 500,
  ) {
    super(message);

    this.name =
      "IvrExecutionEngineError";
  }
}

export interface CreateIvrExecutionInput {
  accountId:
    string;

  callId:
    string;

  flowId:
    string;

  flowVersionId:
    string;

  voiceChannelId:
    string;

  provider:
    IvrProviderId;

  context?:
    Record<
      string,
      unknown
    >;
}

export interface RunIvrExecutionInput {
  executionId:
    string;

  providerCallId:
    string;

  clientId:
    string;

  providerConfig:
    VoiceProviderConfig;
}

export interface ResumeIvrExecutionEventInput {
  callId:
    string;

  eventType:
    string;

  payload?:
    Record<
      string,
      unknown
    >;

  providerCallId:
    string;

  clientId:
    string;

  providerConfig:
    VoiceProviderConfig;
}

export interface IvrExecutionState {
  executionId:
    string;

  status:
    "running"
    | "waiting"
    | "completed"
    | "failed"
    | "cancelled";

  currentNodeId:
    string | null;

  ignored?:
    boolean;
}

function errorMessage(
  error:
    unknown,
) {
  return error instanceof Error
    ? error.message
    : String(error);
}

function definitionFromDb(
  value:
    unknown,
): IvrFlowDefinition {
  return value as IvrFlowDefinition;
}

function getNode(
  definition:
    IvrFlowDefinition,

  nodeId:
    string,
) {
  return definition.nodes
    .find(
      (node) =>
        node.id ===
        nodeId,
    );
}

function readContextPath(
  context:
    Record<
      string,
      unknown
    >,

  path:
    string,
): unknown {
  const parts =
    path
      .split(".")
      .map(
        (part) =>
          part.trim(),
      )
      .filter(Boolean);

  let current:
    unknown =
      context;

  for (
    const part of
      parts
  ) {
    if (
      typeof current !==
        "object" ||
      current === null ||
      Array.isArray(
        current,
      )
    ) {
      return undefined;
    }

    current =
      (
        current as
          Record<
            string,
            unknown
          >
      )[part];
  }

  return current;
}

function valuesEqual(
  actual:
    unknown,

  expected:
    unknown,
) {
  if (
    typeof actual ===
      "number" &&
    typeof expected ===
      "number"
  ) {
    return (
      actual ===
      expected
    );
  }

  return (
    String(
      actual ?? "",
    ) ===
    String(
      expected ?? "",
    )
  );
}

function evaluateCondition(
  node:
    IvrFlowNode,

  context:
    Record<
      string,
      unknown
    >,
) {
  const variable =
    typeof node.data.variable ===
      "string"
      ? node.data.variable
          .trim()
      : "";

  const operator =
    typeof node.data.operator ===
      "string"
      ? node.data.operator
          .trim()
      : "";

  const expected =
    node.data.value;

  const actual =
    readContextPath(
      context,
      variable,
    );

  let result =
    false;

  switch (
    operator
  ) {
    case "equals":
      result =
        valuesEqual(
          actual,
          expected,
        );
      break;

    case "not_equals":
      result =
        !valuesEqual(
          actual,
          expected,
        );
      break;

    case "contains":
      result =
        Array.isArray(
          actual,
        )
          ? actual.some(
              (item) =>
                valuesEqual(
                  item,
                  expected,
                ),
            )
          : String(
              actual ?? "",
            ).includes(
              String(
                expected ?? "",
              ),
            );
      break;

    case "exists":
      result =
        actual !==
          undefined &&
        actual !==
          null &&
        actual !==
          "";
      break;

    case "greater_than":
      result =
        Number(
          actual,
        ) >
        Number(
          expected,
        );
      break;

    case "less_than":
      result =
        Number(
          actual,
        ) <
        Number(
          expected,
        );
      break;

    default:
      throw new IvrExecutionEngineError(
        "ivr_condition_operator_invalid",
        `Operador de condicao invalido: ${operator}.`,
        422,
      );
  }

  return result
    ? "true"
    : "false";
}

const weekdayMap:
  Record<
    string,
    number
  > = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function parseTime(
  value:
    unknown,
) {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const match =
    /^([01]\d|2[0-3]):([0-5]\d)$/
      .exec(
        value.trim(),
      );

  if (!match) {
    return null;
  }

  return (
    Number(match[1]) *
      60 +
    Number(match[2])
  );
}

function normalizeWeekdays(
  value:
    unknown,
) {
  const result =
    new Set<
      number
    >();

  if (
    !Array.isArray(
      value,
    )
  ) {
    return result;
  }

  for (
    const item of
      value
  ) {
    const number =
      typeof item ===
        "number"
        ? item
        : Number(
            item,
          );

    if (
      Number.isInteger(
        number,
      ) &&
      number >= 0 &&
      number <= 6
    ) {
      result.add(
        number,
      );
    }
  }

  return result;
}

function evaluateBusinessHours(
  node:
    IvrFlowNode,
) {
  const timezone =
    typeof node.data.timezone ===
      "string"
      ? node.data.timezone
          .trim()
      : "";

  const start =
    parseTime(
      node.data.startTime,
    );

  const end =
    parseTime(
      node.data.endTime,
    );

  const weekdays =
    normalizeWeekdays(
      node.data.weekdays,
    );

  if (
    !timezone ||
    start === null ||
    end === null ||
    weekdays.size === 0
  ) {
    throw new IvrExecutionEngineError(
      "ivr_business_hours_invalid",
      "Configuracao de horario de atendimento invalida.",
      422,
    );
  }

  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          timezone,

        weekday:
          "short",

        hour:
          "2-digit",

        minute:
          "2-digit",

        hourCycle:
          "h23",
      },
    ).formatToParts(
      new Date(),
    );

  const weekdayText =
    parts.find(
      (part) =>
        part.type ===
        "weekday",
    )?.value;

  const hour =
    Number(
      parts.find(
        (part) =>
          part.type ===
          "hour",
      )?.value,
    );

  const minute =
    Number(
      parts.find(
        (part) =>
          part.type ===
          "minute",
      )?.value,
    );

  const weekday =
    weekdayText
      ? weekdayMap[
          weekdayText
        ]
      : undefined;

  if (
    weekday ===
      undefined ||
    !Number.isFinite(
      hour,
    ) ||
    !Number.isFinite(
      minute,
    )
  ) {
    throw new IvrExecutionEngineError(
      "ivr_business_hours_timezone_invalid",
      `Nao foi possivel avaliar o timezone ${timezone}.`,
      422,
    );
  }

  const current =
    hour *
      60 +
    minute;

  let open =
    false;

  if (
    start <
    end
  ) {
    open =
      weekdays.has(
        weekday,
      ) &&
      current >=
        start &&
      current <
        end;
  }

  if (
    start >
    end
  ) {
    if (
      current >=
      start
    ) {
      open =
        weekdays.has(
          weekday,
        );
    }

    if (
      current <
      end
    ) {
      const previousDay =
        (
          weekday +
          6
        ) %
        7;

      open =
        weekdays.has(
          previousDay,
        );
    }
  }

  return open
    ? "open"
    : "closed";
}

async function executeNode(
  node:
    IvrFlowNode,

  executionContext:
    Record<
      string,
      unknown
    >,

  runtimeContext:
    IvrRuntimeContext,

  provider:
    IvrProviderId,
): Promise<
  IvrRuntimeResult
> {
  if (
    node.type ===
    "trigger.inbound"
  ) {
    return {
      status:
        "completed",
    };
  }

  if (
    node.type ===
    "logic.condition"
  ) {
    return {
      status:
        "completed",

      output: {
        branch:
          evaluateCondition(
            node,
            executionContext,
          ),
      },
    };
  }

  if (
    node.type ===
    "time.business_hours"
  ) {
    return {
      status:
        "completed",

      output: {
        branch:
          evaluateBusinessHours(
            node,
          ),
      },
    };
  }

  const runtime =
    getIvrRuntime(
      provider,
    );

  return runtime.executeNode(
    runtimeContext,
    node,
  );
}

function nextNodeId(
  definition:
    IvrFlowDefinition,

  node:
    IvrFlowNode,

  output?:
    Record<
      string,
      unknown
    >,
) {
  const outgoing =
    definition.edges
      .filter(
        (edge) =>
          edge.source ===
          node.id,
      );

  const branch =
    typeof output?.branch ===
      "string"
      ? output.branch
      : null;

  if (branch) {
    const edge =
      outgoing.find(
        (item) =>
          item.sourceHandle ===
          branch,
      );

    if (!edge) {
      throw new IvrExecutionEngineError(
        "ivr_branch_not_connected",
        `A saida ${branch} do node ${node.id} nao possui destino.`,
        422,
      );
    }

    return edge.target;
  }

  if (
    outgoing.length ===
    0
  ) {
    return null;
  }

  if (
    outgoing.length ===
    1
  ) {
    return outgoing[0]
      .target;
  }

  throw new IvrExecutionEngineError(
    "ivr_output_ambiguous",
    `O node ${node.id} possui mais de uma saida sem branch definido.`,
    422,
  );
}

async function getExecution(
  executionId:
    string,
) {
  const [execution] =
    await db
      .select()
      .from(
        ivrExecutions,
      )
      .where(
        eq(
          ivrExecutions.id,
          executionId,
        ),
      )
      .limit(1);

  if (!execution) {
    throw new IvrExecutionEngineError(
      "ivr_execution_not_found",
      "Execucao IVR nao encontrada.",
      404,
    );
  }

  return execution;
}

async function getDefinition(
  flowVersionId:
    string,
) {
  const [version] =
    await db
      .select()
      .from(
        ivrFlowVersions,
      )
      .where(
        eq(
          ivrFlowVersions.id,
          flowVersionId,
        ),
      )
      .limit(1);

  if (!version) {
    throw new IvrExecutionEngineError(
      "ivr_version_not_found",
      "Versao IVR nao encontrada.",
      404,
    );
  }

  return definitionFromDb(
    version.definition,
  );
}

async function nextStepSequence(
  executionId:
    string,
) {
  const [lastStep] =
    await db
      .select({
        sequence:
          ivrExecutionSteps
            .sequence,
      })
      .from(
        ivrExecutionSteps,
      )
      .where(
        eq(
          ivrExecutionSteps
            .executionId,
          executionId,
        ),
      )
      .orderBy(
        desc(
          ivrExecutionSteps
            .sequence,
        ),
      )
      .limit(1);

  return (
    lastStep?.sequence ??
    0
  ) + 1;
}

async function failExecution(
  executionId:
    string,

  message:
    string,
) {
  const now =
    new Date();

  await db
    .update(
      ivrExecutions,
    )
    .set({
      status:
        "failed",

      error:
        message,

      endedAt:
        now,

      updatedAt:
        now,
    })
    .where(
      eq(
        ivrExecutions.id,
        executionId,
      ),
    );
}

export async function createIvrExecution(
  input:
    CreateIvrExecutionInput,
) {
  const [existing] =
    await db
      .select()
      .from(
        ivrExecutions,
      )
      .where(
        eq(
          ivrExecutions.callId,
          input.callId,
        ),
      )
      .limit(1);

  if (existing) {
    return existing;
  }

  const [version] =
    await db
      .select()
      .from(
        ivrFlowVersions,
      )
      .where(
        and(
          eq(
            ivrFlowVersions.id,
            input.flowVersionId,
          ),

          eq(
            ivrFlowVersions.flowId,
            input.flowId,
          ),

          eq(
            ivrFlowVersions.status,
            "published",
          ),
        ),
      )
      .limit(1);

  if (!version) {
    throw new IvrExecutionEngineError(
      "ivr_published_version_not_found",
      "Versao publicada do fluxo nao encontrada.",
      404,
    );
  }

  const definition =
    definitionFromDb(
      version.definition,
    );

  const startNodes =
    definition.nodes
      .filter(
        (node) =>
          node.type ===
          "trigger.inbound",
      );

  if (
    startNodes.length !==
    1
  ) {
    throw new IvrExecutionEngineError(
      "ivr_start_invalid",
      "O fluxo publicado precisa possuir exatamente um Inicio.",
      422,
    );
  }

  const [created] =
    await db
      .insert(
        ivrExecutions,
      )
      .values({
        accountId:
          input.accountId,

        callId:
          input.callId,

        flowId:
          input.flowId,

        flowVersionId:
          input.flowVersionId,

        voiceChannelId:
          input.voiceChannelId,

        provider:
          input.provider,

        status:
          "running",

        currentNodeId:
          startNodes[0].id,

        context:
          input.context ??
          {},
      })
      .returning();

  if (!created) {
    throw new IvrExecutionEngineError(
      "ivr_execution_create_failed",
      "Nao foi possivel criar a execucao IVR.",
      500,
    );
  }

  return created;
}

export async function runIvrExecution(
  input:
    RunIvrExecutionInput,
): Promise<
  IvrExecutionState
> {
  const execution =
    await getExecution(
      input.executionId,
    );

  if (
    execution.status ===
      "completed" ||
    execution.status ===
      "failed" ||
    execution.status ===
      "cancelled"
  ) {
    return {
      executionId:
        execution.id,

      status:
        execution.status,

      currentNodeId:
        execution.currentNodeId,
    };
  }

  if (
    execution.status ===
    "waiting"
  ) {
    return {
      executionId:
        execution.id,

      status:
        "waiting",

      currentNodeId:
        execution.currentNodeId,
    };
  }

  if (
    input.providerConfig
      .provider !==
    execution.provider
  ) {
    throw new IvrExecutionEngineError(
      "ivr_provider_config_mismatch",
      "Provider da configuracao nao corresponde a execucao IVR.",
      500,
    );
  }

  const definition =
    await getDefinition(
      execution.flowVersionId,
    );

  const configuredMax =
    definition.settings
      ?.maxSteps;

  const maxSteps =
    typeof configuredMax ===
      "number" &&
    Number.isInteger(
      configuredMax,
    ) &&
    configuredMax > 0
      ? configuredMax
      : 100;

  let currentNodeId =
    execution.currentNodeId;

  while (
    currentNodeId
  ) {
    const sequence =
      await nextStepSequence(
        execution.id,
      );

    if (
      sequence >
      maxSteps
    ) {
      const message =
        `Limite de ${maxSteps} steps excedido.`;

      await failExecution(
        execution.id,
        message,
      );

      throw new IvrExecutionEngineError(
        "ivr_max_steps_exceeded",
        message,
        422,
      );
    }

    const node =
      getNode(
        definition,
        currentNodeId,
      );

    if (!node) {
      const message =
        `Node ${currentNodeId} nao encontrado na versao publicada.`;

      await failExecution(
        execution.id,
        message,
      );

      throw new IvrExecutionEngineError(
        "ivr_node_not_found",
        message,
        500,
      );
    }

    const [step] =
      await db
        .insert(
          ivrExecutionSteps,
        )
        .values({
          executionId:
            execution.id,

          sequence,

          nodeId:
            node.id,

          nodeType:
            node.type,

          status:
            "entered",

          input: {
            executionContext:
              execution.context,
          },
        })
        .returning();

    if (!step) {
      throw new IvrExecutionEngineError(
        "ivr_step_create_failed",
        "Nao foi possivel criar o step IVR.",
        500,
      );
    }

    try {
      const runtimeContext:
        IvrRuntimeContext = {
        accountId:
          execution.accountId,

        executionId:
          execution.id,

        stepSequence:
          sequence,

        callId:
          execution.callId,

        providerCallId:
          input.providerCallId,

        clientId:
          input.clientId,

        providerConfig:
          input.providerConfig,
      };

      const result =
        await executeNode(
          node,
          execution.context,
          runtimeContext,
          execution.provider,
        );

      if (
        result.status ===
        "waiting"
      ) {
        const now =
          new Date();

        await db
          .update(
            ivrExecutionSteps,
          )
          .set({
            status:
              "waiting",

            output:
              result.output ??
              {},
          })
          .where(
            eq(
              ivrExecutionSteps.id,
              step.id,
            ),
          );

        await db
          .update(
            ivrExecutions,
          )
          .set({
            status:
              "waiting",

            currentNodeId:
              node.id,

            updatedAt:
              now,
          })
          .where(
            eq(
              ivrExecutions.id,
              execution.id,
            ),
          );

        return {
          executionId:
            execution.id,

          status:
            "waiting",

          currentNodeId:
            node.id,
        };
      }

      const now =
        new Date();

      await db
        .update(
          ivrExecutionSteps,
        )
        .set({
          status:
            "completed",

          output:
            result.output ??
            {},

          endedAt:
            now,
        })
        .where(
          eq(
            ivrExecutionSteps.id,
            step.id,
          ),
        );

      const next =
        node.type ===
          "call.hangup" ||
        node.type ===
          "queue.route"
          ? null
          : nextNodeId(
              definition,
              node,
              result.output,
            );

      if (!next) {
        if (
          node.type ===
            "call.hangup" ||
          node.type ===
            "queue.route"
        ) {
          await db
            .update(
              ivrExecutions,
            )
            .set({
              status:
                "completed",

              currentNodeId:
                node.id,

              endedAt:
                now,

              updatedAt:
                now,
            })
            .where(
              eq(
                ivrExecutions.id,
                execution.id,
              ),
            );

          return {
            executionId:
              execution.id,

            status:
              "completed",

            currentNodeId:
              node.id,
          };
        }

        const message =
          `O fluxo terminou no node ${node.id} sem um destino.`;

        await failExecution(
          execution.id,
          message,
        );

        throw new IvrExecutionEngineError(
          "ivr_next_node_missing",
          message,
          422,
        );
      }

      currentNodeId =
        next;

      await db
        .update(
          ivrExecutions,
        )
        .set({
          status:
            "running",

          currentNodeId:
            next,

          updatedAt:
            now,
        })
        .where(
          eq(
            ivrExecutions.id,
            execution.id,
          ),
        );
    } catch (error) {
      const message =
        errorMessage(
          error,
        );

      const now =
        new Date();

      await db
        .update(
          ivrExecutionSteps,
        )
        .set({
          status:
            "failed",

          error:
            message,

          endedAt:
            now,
        })
        .where(
          eq(
            ivrExecutionSteps.id,
            step.id,
          ),
        );

      await failExecution(
        execution.id,
        message,
      );

      throw error;
    }
  }

  throw new IvrExecutionEngineError(
    "ivr_current_node_missing",
    "Execucao IVR nao possui node atual.",
    500,
  );
}

export async function resumeIvrExecutionEvent(
  input:
    ResumeIvrExecutionEventInput,
): Promise<
  IvrExecutionState | null
> {
  const [execution] =
    await db
      .select()
      .from(
        ivrExecutions,
      )
      .where(
        eq(
          ivrExecutions.callId,
          input.callId,
        ),
      )
      .limit(1);

  if (!execution) {
    return null;
  }

  if (
    execution.status !==
    "waiting"
  ) {
    return {
      executionId:
        execution.id,

      status:
        execution.status,

      currentNodeId:
        execution.currentNodeId,

      ignored:
        true,
    };
  }

  const [step] =
    await db
      .select()
      .from(
        ivrExecutionSteps,
      )
      .where(
        and(
          eq(
            ivrExecutionSteps
              .executionId,
            execution.id,
          ),

          eq(
            ivrExecutionSteps.status,
            "waiting",
          ),
        ),
      )
      .orderBy(
        desc(
          ivrExecutionSteps
            .sequence,
        ),
      )
      .limit(1);

  if (!step) {
    return {
      executionId:
        execution.id,

      status:
        "waiting",

      currentNodeId:
        execution.currentNodeId,

      ignored:
        true,
    };
  }

  const output =
    step.output ??
    {};

  const expectedEvent =
    typeof output.waitForEvent ===
      "string"
      ? output.waitForEvent
      : null;

  const expectedPlaybackId =
    typeof output.playbackId ===
      "string"
      ? output.playbackId
      : null;

  const receivedPlaybackId =
    typeof input.payload
      ?.playbackId ===
      "string"
      ? input.payload
          .playbackId
      : null;

  if (
    expectedPlaybackId &&
    expectedPlaybackId !==
      receivedPlaybackId
  ) {
    return {
      executionId:
        execution.id,

      status:
        "waiting",

      currentNodeId:
        execution.currentNodeId,

      ignored:
        true,
    };
  }

  if (
    expectedEvent ===
      "playback.completed" &&
    (
      input.eventType ===
        "playback.failed" ||
      input.eventType ===
        "playback.stopped"
    )
  ) {
    const message =
      input.eventType ===
        "playback.failed"
        ? "Playback do IVR falhou."
        : "Playback do IVR foi interrompido.";

    const now =
      new Date();

    await db
      .update(
        ivrExecutionSteps,
      )
      .set({
        status:
          "failed",

        error:
          message,

        output: {
          ...output,

          event:
            input.payload ??
            {},
        },

        endedAt:
          now,
      })
      .where(
        eq(
          ivrExecutionSteps.id,
          step.id,
        ),
      );

    await failExecution(
      execution.id,
      message,
    );

    return {
      executionId:
        execution.id,

      status:
        "failed",

      currentNodeId:
        execution.currentNodeId,
    };
  }

  if (
    input.eventType !==
    expectedEvent
  ) {
    return {
      executionId:
        execution.id,

      status:
        "waiting",

      currentNodeId:
        execution.currentNodeId,

      ignored:
        true,
    };
  }

  const definition =
    await getDefinition(
      execution.flowVersionId,
    );

  const node =
    execution.currentNodeId
      ? getNode(
          definition,
          execution.currentNodeId,
        )
      : null;

  if (!node) {
    throw new IvrExecutionEngineError(
      "ivr_waiting_node_not_found",
      "Node aguardando evento nao encontrado.",
      500,
    );
  }

  const now =
    new Date();

  await db
    .update(
      ivrExecutionSteps,
    )
    .set({
      status:
        "completed",

      output: {
        ...output,

        event:
          input.payload ??
          {},
      },

      endedAt:
        now,
    })
    .where(
      eq(
        ivrExecutionSteps.id,
        step.id,
      ),
    );

  const next =
    nextNodeId(
      definition,
      node,
      output,
    );

  if (!next) {
    const message =
      `O node ${node.id} concluiu, mas nao possui destino.`;

    await failExecution(
      execution.id,
      message,
    );

    throw new IvrExecutionEngineError(
      "ivr_next_node_missing_after_event",
      message,
      422,
    );
  }

  await db
    .update(
      ivrExecutions,
    )
    .set({
      status:
        "running",

      currentNodeId:
        next,

      updatedAt:
        now,
    })
    .where(
      eq(
        ivrExecutions.id,
        execution.id,
      ),
    );

  return runIvrExecution({
    executionId:
      execution.id,

    providerCallId:
      input.providerCallId,

    clientId:
      input.clientId,

    providerConfig:
      input.providerConfig,
  });
}


