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
  eq,
} from "drizzle-orm";

import type {
  IvrFlowNode,
} from "../types";

function textConfig(
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
  if (
    !waCallsVoiceProvider
      .playAudio
  ) {
    throw new IvrRuntimeError(
      "wacalls_playback_not_implemented",
      "Playback de audio nao esta implementado no provider WaCalls.",
      501,
    );
  }

  const audioUrl =
    textConfig(
      node,
      "audioUrl",
    );

  if (!audioUrl) {
    /*
     * Mais adiante audioAssetId sera
     * resolvido pela biblioteca de midia.
     *
     * Neste momento o runtime exige
     * uma URL HTTP(S) efetiva.
     */
    throw new IvrRuntimeError(
      "ivr_audio_url_required",
      "O bloco Audio nao possui URL de playback.",
      422,
    );
  }

  const playbackId =
    `ivr-${context.executionId}-${node.id}-${context.stepSequence}`;

  const result =
    await waCallsVoiceProvider
      .playAudio(
        {
          providerCallId:
            context.providerCallId,

          clientId:
            context.clientId,

          audioUrl,

          playbackId,
        },

        context.providerConfig,
      );

  return {
    /*
     * O POST inicia o playback.
     *
     * O IVR Engine completo aguardara
     * playback.completed via evento
     * antes de seguir para o proximo node.
     */
    status:
      "waiting",

    output: {
      playbackId:
        result.playbackId,

      waitForEvent:
        "playback.completed",
    },
  };
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
        eq(
          calls.id,
          context.callId,
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

