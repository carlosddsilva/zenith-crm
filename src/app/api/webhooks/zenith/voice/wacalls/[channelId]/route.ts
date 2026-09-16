import {
  timingSafeEqual,
} from "node:crypto";

import {
  and,
  eq,
} from "drizzle-orm";

import {
  NextResponse,
} from "next/server";

import {
  db,
} from "@/lib/db/client";

import {
  calls,
  voiceChannels,
} from "@/lib/db/schema";

import {
  resolveInboundIvrBinding,
} from "@/lib/ivr/binding-resolver";

import {
  createIvrExecution,
  resumeIvrExecutionEvent,
  runIvrExecution,
} from "@/lib/ivr/execution-engine";

import {
  resolveWaitingIvrPlayback,
} from "@/lib/ivr/playback-resolver";

import {
  appendCallEvent,
  canTransitionCallState,
  transitionCallState,
  handoffInboundCallToAgents,
} from "@/lib/voice/call-state";

import {
  resolveVoiceChannelRecord,
} from "@/lib/voice/channel-store";

import {
  findOrCreateInboundCall,
} from "@/lib/voice/inbound-call";
import { isUuid } from "@/lib/validation/uuid";

function secureEquals(
  left: string,
  right: string,
) {
  const a =
    Buffer.from(
      left,
      "utf8",
    );

  const b =
    Buffer.from(
      right,
      "utf8",
    );

  return (
    a.length > 0 &&
    a.length === b.length &&
    timingSafeEqual(a, b)
  );
}

function getWaCallsProviderCallId(
  payload: Record<string, unknown>,
) {
  return typeof payload.id ===
    "string"
    ? payload.id.trim()
    : typeof payload.callId ===
        "string"
      ? payload.callId.trim()
      : "";
}

function getWaCallsEventDate(
  value: unknown,
) {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return new Date(value);
  }

  return new Date();
}

function mapWaCallsStatus(
  status: string,
) {
  switch (status) {
    case "starting":
      return "connecting" as const;

    case "ringing":
      return "ringing" as const;

    case "connected":
      return "active" as const;

    case "ended":
      return "ended" as const;

    default:
      return null;
  }
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      channelId: string;
    }>;
  },
) {
  const { channelId } =
    await params;
  if (!isUuid(channelId)) {
    return NextResponse.json({ error: "Invalid channel identifier" }, { status: 400 });
  }

  const expectedToken =
    process.env
      .VOICE_WEBHOOK_TOKEN
      ?.trim() ?? "";

  const url =
    new URL(request.url);

  const headerToken =
    request.headers
      .get(
        "x-zenith-webhook-token",
      )
      ?.trim() ?? "";

  const queryToken =
    url.searchParams
      .get("token")
      ?.trim() ?? "";

  const receivedToken =
    headerToken ||
    queryToken;

  if (
    !expectedToken ||
    !receivedToken ||
    !secureEquals(
      receivedToken,
      expectedToken,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Unauthorized webhook",
      },
      {
        status: 401,
      },
    );
  }

  const [channel] =
    await db
      .select()
      .from(
        voiceChannels,
      )
      .where(
        and(
          eq(
            voiceChannels.id,
            channelId,
          ),

          eq(
            voiceChannels.provider,
            "wacalls",
          ),

          eq(
            voiceChannels.isActive,
            true,
          ),

        ),
      )
      .limit(1);

  if (!channel) {
    return NextResponse.json(
      {
        error:
          "WaCalls voice channel not found",
      },
      {
        status: 404,
      },
    );
  }

  const raw =
    await request.text();

  let payload:
    Record<
      string,
      unknown
    >;

  try {
    payload =
      JSON.parse(
        raw,
      ) as Record<
        string,
        unknown
      >;
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid JSON",
      },
      {
        status: 400,
      },
    );
  }

  const eventType =
    typeof payload.event ===
      "string"
      ? payload.event
      : typeof payload.type ===
          "string"
        ? payload.type
        : "unknown";

  const isPlaybackEvent =
    eventType ===
      "playback.completed" ||
    eventType ===
      "playback.failed" ||
    eventType ===
      "playback.stopped";

  if (isPlaybackEvent) {
    const playbackId =
      typeof payload.playbackId ===
        "string"
        ? payload.playbackId.trim()
        : "";

    if (!playbackId) {
      return NextResponse.json(
        {
          error:
            "WaCalls playback event without playbackId",
        },
        {
          status: 400,
        },
      );
    }

    const playback =
      await resolveWaitingIvrPlayback({
        voiceChannelId:
          channel.id,

        playbackId,
      });

    /*
     * Pode ocorrer em retry, evento atrasado
     * ou playback que nao pertence a um IVR.
     *
     * Nao tratamos isso como erro HTTP.
     */
    if (!playback) {
      return NextResponse.json({
        ok:
          true,

        accepted:
          true,

        ignored:
          true,

        reason:
          "waiting_playback_not_found",

        eventType,

        playbackId,
      });
    }

    if (
      playback.provider !==
      "wacalls"
    ) {
      return NextResponse.json(
        {
          error:
            "Playback provider mismatch",
        },
        {
          status: 409,
        },
      );
    }

    const providerCallIdValue =
      playback.context
        .providerCallId;

    const providerCallId =
      typeof providerCallIdValue ===
        "string"
        ? providerCallIdValue.trim()
        : "";

    if (!providerCallId) {
      return NextResponse.json(
        {
          error:
            "IVR execution without providerCallId",
        },
        {
          status: 500,
        },
      );
    }

    /*
     * Id deterministico para tornar a escrita
     * do call_event idempotente mesmo que o
     * Gateway repita o mesmo evento SSE.
     */
    const providerEventId =
      `wacalls:${eventType}:${playbackId}`;

    await appendCallEvent({
      accountId:
        channel.accountId,

      callId:
        playback.callId,

      eventType,

      providerEventId,

      payload,
    });

    const resolvedChannel =
      resolveVoiceChannelRecord(
        channel,
      );

    const result =
      await resumeIvrExecutionEvent({
        callId:
          playback.callId,

        eventType,

        payload,

        providerCallId,

        /*
         * IVR inbound e consumidor server-side.
         * Mantemos a mesma identidade utilizada
         * na execucao inicial.
         */
        clientId:
          channel.id,

        providerConfig:
          resolvedChannel.config,
      });

    return NextResponse.json({
      ok:
        true,

      accepted:
        true,

      channelId:
        channel.id,

      provider:
        channel.provider,

      eventType,

      playbackId,

      ivrExecutionId:
        playback.executionId,

      result,
    });
  }

  const isCallLifecycleEvent =
    eventType ===
      "call-status" ||
    eventType ===
      "call-ended";

  if (isCallLifecycleEvent) {
    const providerCallId =
      getWaCallsProviderCallId(
        payload,
      );

    if (!providerCallId) {
      return NextResponse.json(
        {
          error:
            `WaCalls ${eventType} event without call id`,
        },
        {
          status: 400,
        },
      );
    }

    const payloadSessionId =
      typeof payload.sessionId ===
        "string"
        ? payload.sessionId.trim()
        : "";

    const channelConfig =
      channel.config ?? {};

    const expectedSessionId =
      typeof channelConfig.sessionId ===
        "string"
        ? channelConfig.sessionId.trim()
        : "";

    if (
      expectedSessionId &&
      payloadSessionId !==
        expectedSessionId
    ) {
      return NextResponse.json(
        {
          error:
            "WaCalls session mismatch",
        },
        {
          status: 409,
        },
      );
    }

    const [call] =
      await db
        .select()
        .from(calls)
        .where(
          and(
            eq(
              calls.accountId,
              channel.accountId,
            ),

            eq(
              calls.voiceChannelId,
              channel.id,
            ),

            eq(
              calls.provider,
              "wacalls",
            ),


            eq(
              calls.providerCallId,
              providerCallId,
            ),
          ),
        )
        .limit(1);

    /*
     * WaCalls normalmente emite call-status antes
     * do evento incoming. Nesse momento a chamada
     * ainda nao existe no Zenith.
     *
     * Nao tratamos isso como falha: o incoming
     * subsequente criara a chamada.
     */
    if (!call) {
      return NextResponse.json({
        ok: true,
        accepted: true,
        ignored: true,
        reason:
          "call_not_found_yet",
        eventType,
        providerCallId,
      });
    }

    if (
      eventType ===
        "call-status"
    ) {
      const providerStatus =
        typeof payload.status ===
          "string"
          ? payload.status.trim()
          : "";

      const nextState =
        mapWaCallsStatus(
          providerStatus,
        );

      if (!nextState) {
        return NextResponse.json({
          ok: true,
          accepted: true,
          ignored: true,
          reason:
            "unsupported_wacalls_status",
          eventType,
          providerCallId,
          providerStatus,
        });
      }

      /*
       * Protege contra eventos atrasados ou
       * fora de ordem depois de uma chamada
       * ja ter avancado para outro estado.
       */
      if (
        !canTransitionCallState(
          call.state,
          nextState,
        )
      ) {
        return NextResponse.json({
          ok: true,
          accepted: true,
          ignored: true,
          reason:
            "invalid_or_stale_call_transition",
          eventType,
          providerCallId,
          currentState:
            call.state,
          nextState,
        });
      }

      const providerEventId =
        `wacalls:call-status:${providerCallId}:${providerStatus}`;

      const updated =
        await transitionCallState({
          accountId:
            channel.accountId,

          callId:
            call.id,

          nextState,

          eventType:
            "call-status",

          providerEventId,

          payload,

          /*
           * call-status nao possui timestamp
           * especifico da transicao.
           * startedAt e o inicio da chamada,
           * portanto nao deve ser usado aqui.
           */
          occurredAt:
            new Date(),
        });

      return NextResponse.json({
        ok: true,
        accepted: true,
        channelId:
          channel.id,
        provider:
          channel.provider,
        eventType,
        providerCallId,
        providerStatus,
        state:
          updated.state,
      });
    }

    const reason =
      typeof payload.reason ===
        "string"
        ? payload.reason.trim()
        : "";

    const occurredAt =
      getWaCallsEventDate(
        payload.endedAt,
      );

    const providerEventId =
      `wacalls:call-ended:${providerCallId}`;

    /*
     * Se algum outro mecanismo ja marcou
     * failed/rejected, preservamos esse estado
     * terminal e apenas registramos o evento
     * final do WaCalls.
     */
    if (
      call.state === "failed" ||
      call.state === "rejected"
    ) {
      await appendCallEvent({
        accountId:
          channel.accountId,

        callId:
          call.id,

        eventType:
          "call-ended",

        providerEventId,

        payload,

        occurredAt,
      });

      return NextResponse.json({
        ok: true,
        accepted: true,
        channelId:
          channel.id,
        provider:
          channel.provider,
        eventType,
        providerCallId,
        state:
          call.state,
      });
    }

    if (
      !canTransitionCallState(
        call.state,
        "ended",
      )
    ) {
      return NextResponse.json({
        ok: true,
        accepted: true,
        ignored: true,
        reason:
          "invalid_or_stale_call_transition",
        eventType,
        providerCallId,
        currentState:
          call.state,
        nextState:
          "ended",
      });
    }

    const updated =
      await transitionCallState({
        accountId:
          channel.accountId,

        callId:
          call.id,

        nextState:
          "ended",

        eventType:
          "call-ended",

        providerEventId,

        payload,

        occurredAt,

        endReason:
          reason ||
          null,
      });

    return NextResponse.json({
      ok: true,
      accepted: true,
      channelId:
        channel.id,
      provider:
        channel.provider,
      eventType,
      providerCallId,
      state:
        updated.state,
      endReason:
        updated.endReason,
    });
  }

  let inboundCall:
    Awaited<
      ReturnType<
        typeof findOrCreateInboundCall
      >
    > | null =
      null;

  if (
    eventType ===
      "incoming" ||
    eventType ===
      "call.incoming"
  ) {
    if (!channel.allowInbound) {
      return NextResponse.json({
        ok: true,
        accepted: true,
        ignored: true,
        reason:
          "inbound_disabled",
        channelId:
          channel.id,
      });
    }

    const providerCallId =
      typeof payload.id ===
        "string"
        ? payload.id
        : typeof payload.callId ===
            "string"
          ? payload.callId
          : "";

    if (!providerCallId.trim()) {
      return NextResponse.json(
        {
          error:
            "WaCalls incoming event without call id",
        },
        {
          status: 400,
        },
      );
    }

    const payloadSessionId =
      typeof payload.sessionId ===
        "string"
        ? payload.sessionId
        : "";

    const channelConfig =
      channel.config ?? {};

    const expectedSessionId =
      typeof channelConfig.sessionId ===
        "string"
        ? channelConfig.sessionId
        : "";

    if (
      expectedSessionId &&
      payloadSessionId !==
        expectedSessionId
    ) {
      return NextResponse.json(
        {
          error:
            "WaCalls session mismatch",
        },
        {
          status: 409,
        },
      );
    }

    const peer =
      typeof payload.peer ===
        "string"
        ? payload.peer
        : null;

    const offeredAt =
      typeof payload.offeredAt ===
        "number" &&
      Number.isFinite(
        payload.offeredAt,
      )
        ? new Date(
            payload.offeredAt,
          )
        : new Date();

    inboundCall =
      await findOrCreateInboundCall({
        accountId:
          channel.accountId,

        voiceChannelId:
          channel.id,

        provider:
          "wacalls",

        providerCallId,

        fromPhone:
          peer,

        occurredAt:
          offeredAt,
      });

    await appendCallEvent({
      accountId:
        channel.accountId,

      callId:
        inboundCall.call.id,

      eventType:
        "incoming",

      providerEventId:
        `wacalls:incoming:${providerCallId}`,

      payload,

      occurredAt:
        offeredAt,
    });
  }

  const routingKey =
    typeof payload.routingKey ===
      "string"
      ? payload.routingKey
      : null;

  const ivrBinding =
    await resolveInboundIvrBinding({
      accountId:
        channel.accountId,

      voiceChannelId:
        channel.id,

      routingKey,
    });

  let ivrExecution:
    Awaited<
      ReturnType<
        typeof createIvrExecution
      >
    > | null =
      null;

  if (
    inboundCall &&
    ivrBinding
  ) {
    ivrExecution =
      await createIvrExecution({
        accountId:
          channel.accountId,

        callId:
          inboundCall.call.id,

        flowId:
          ivrBinding.flowId,

        flowVersionId:
          ivrBinding.flowVersionId,

        voiceChannelId:
          channel.id,

        provider:
          "wacalls",

        context: {
          providerCallId:
            inboundCall.call.providerCallId,

          fromPhone:
            inboundCall.call.fromPhone,

          toPhone:
            inboundCall.call.toPhone,

          routingKey:
            ivrBinding.routingKey,
        },
      });

    const resolvedChannel =
      resolveVoiceChannelRecord(
        channel,
      );

    const providerCallId =
      inboundCall.call.providerCallId;

    if (!providerCallId) {
      return NextResponse.json(
        {
          error:
            "Inbound call without providerCallId",
        },
        {
          status: 500,
        },
      );
    }

    await runIvrExecution({
      executionId:
        ivrExecution.id,

      providerCallId,

      /*
       * Inbound IVR nao possui operador humano.
       * O canal identifica o consumidor server-side
       * perante o provider.
       */
      clientId:
        channel.id,

      providerConfig:
        resolvedChannel.config,
    });
  } else if (inboundCall && !ivrBinding) {
    await handoffInboundCallToAgents({
      accountId: channel.accountId,
      callId: inboundCall.call.id,
      occurredAt: new Date(),
    });
  }

  return NextResponse.json({
    ok: true,

    accepted:
      true,

    channelId:
      channel.id,

    provider:
      channel.provider,

    eventType,

    ivrBinding:
      ivrBinding
        ? {
            bindingId:
              ivrBinding.bindingId,

            flowId:
              ivrBinding.flowId,

            flowVersionId:
              ivrBinding.flowVersionId,

            routingKey:
              ivrBinding.routingKey,
          }
        : null,

    ivrExecutionId:
      ivrExecution?.id ??
      null,
  });
}














