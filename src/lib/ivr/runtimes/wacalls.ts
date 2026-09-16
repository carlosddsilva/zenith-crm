import {
  waCallsVoiceProvider,
} from "@/lib/voice/providers/wacalls";

import {
  IvrRuntimeError,
} from "../runtime";

import type {
  IvrRuntime,
  IvrRuntimeContext,
  IvrRuntimeResult,
} from "../runtime";

import {
  handoffInboundCallToAgents,
} from "@/lib/voice/call-state";

import {
  db,
} from "@/lib/db/client";

import {
  calls,
} from "@/lib/db/schema";

import {
  and,
  eq,
} from "drizzle-orm";

import type {
  IvrFlowNode,
} from "../types";

async function executeAnswer(
  context:
    IvrRuntimeContext,
): Promise<
  IvrRuntimeResult
> {
  await waCallsVoiceProvider
    .acceptCall(
      {
        providerCallId:
          context.providerCallId,

        clientId:
          context.clientId,
      },

      context.providerConfig,
    );

  return {
    status:
      "completed",
  };
}

async function executeAudio(
  context:
    IvrRuntimeContext,

  node:
    IvrFlowNode,
): Promise<
  IvrRuntimeResult
> {
  void context;
  void node;

  throw new IvrRuntimeError(
    "wacalls_playback_unsupported",
    "Playback de audio nao e suportado pelo gateway WaCalls atual.",
    501,
  );
}

async function executeHangup(
  context:
    IvrRuntimeContext,
): Promise<
  IvrRuntimeResult
> {
  await waCallsVoiceProvider
    .hangupCall(
      {
        providerCallId:
          context.providerCallId,

        clientId:
          context.clientId,
      },

      context.providerConfig,
    );

  return {
    status:
      "completed",
  };
}

async function executeQueueRoute(
  context:
    IvrRuntimeContext,
): Promise<
  IvrRuntimeResult
> {
  if (
    waCallsVoiceProvider
      .releaseCall
  ) {
    await waCallsVoiceProvider
      .releaseCall(
        {
          providerCallId:
            context.providerCallId,

          clientId:
            context.clientId,
        },

        context.providerConfig,
      );
  }

  const [call] =
    await db
      .select({
        accountId:
          calls.accountId,
      })
      .from(calls)
      .where(
        and(
          eq(
            calls.id,
            context.callId,
          ),

          eq(
            calls.accountId,
            context.accountId,
          ),
        ),
      )
      .limit(1);

  if (!call) {
    throw new IvrRuntimeError(
      "ivr_call_not_found",
      "Chamada nao encontrada no handoff.",
      500,
    );
  }

  await handoffInboundCallToAgents({
    accountId:
      call.accountId,

    callId:
      context.callId,
  });

  return {
    status:
      "completed",
  };
}

export const waCallsIvrRuntime:
  IvrRuntime = {
  provider:
    "wacalls",

  async executeNode(
    context,
    node,
  ) {
    switch (
      node.type
    ) {
      case "trigger.inbound":
        return {
          status:
            "completed",
        };

      case "call.answer":
        return executeAnswer(
          context,
        );

      case "audio.play":
        return executeAudio(
          context,
          node,
        );

      case "queue.route":
        return executeQueueRoute(
          context,
        );

      case "call.hangup":
        return executeHangup(
          context,
        );

      /*
       * Horario e condicao pertencem ao
       * engine central, nao ao provider.
       */
      case "time.business_hours":
      case "logic.condition":
        throw new IvrRuntimeError(
          "ivr_engine_node_not_runtime",
          `O node ${node.type} deve ser executado pelo IVR Engine.`,
          500,
        );

      default:
        throw new IvrRuntimeError(
          "wacalls_ivr_node_not_implemented",
          `O runtime WaCalls ainda nao implementa o node ${node.type}.`,
          501,
        );
    }
  },
};

