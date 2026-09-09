import {
  and,
  eq,
} from "drizzle-orm";

import {
  NextResponse,
} from "next/server";

import {
  requireZenithRole,
} from "@/lib/auth/zenith-account";

import {
  db,
} from "@/lib/db/client";

import {
  calls,
  voiceChannels,
} from "@/lib/db/schema";

import {
  resolveVoiceChannelRecord,
} from "@/lib/voice/channel-store";

import {
  getVoiceProvider,
} from "@/lib/voice/registry";

import {
  VoiceProviderError,
} from "@/lib/voice/types";

const terminalStates =
  new Set([
    "ended",
    "failed",
    "rejected",
  ]);

function handleError(
  error: unknown,
) {
  if (error instanceof Response) {
    return error;
  }

  if (
    error instanceof
      VoiceProviderError
  ) {
    return NextResponse.json(
      {
        error:
          error.message,
        code:
          error.code,
      },
      {
        status:
          error.status,
      },
    );
  }

  const candidateStatus =
    typeof error === "object" &&
    error !== null &&
    "status" in error
      ? Number(
          (
            error as {
              status?: unknown;
            }
          ).status,
        )
      : NaN;

  const status =
    Number.isInteger(
      candidateStatus,
    ) &&
    candidateStatus >= 400 &&
    candidateStatus <= 599
      ? candidateStatus
      : 500;

  console.error(
    "[voice call webrtc]",
    error,
  );

  return NextResponse.json(
    {
      error:
        status === 500
          ? "Erro na negociacao WebRTC."
          : error instanceof Error
            ? error.message
            : "Erro na negociacao WebRTC.",
    },
    {
      status,
    },
  );
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  try {
    const context =
      await requireZenithRole(
        "agent",
      );

    const { id } =
      await params;

    let body: {
      sdp_offer?: unknown;
      client_id?: unknown;
    };

    try {
      body =
        (await request.json()) as {
          sdp_offer?: unknown;
          client_id?: unknown;
        };
    } catch {
      return NextResponse.json(
        {
          error:
            "JSON invalido.",
        },
        {
          status: 400,
        },
      );
    }

    const sdpOffer =
      typeof body.sdp_offer ===
        "string"
        ? body.sdp_offer
        : "";

    const clientId =
      typeof body.client_id ===
        "string"
        ? body.client_id.trim()
        : "";

    if (!sdpOffer) {
      return NextResponse.json(
        {
          error:
            "sdp_offer e obrigatorio.",
        },
        {
          status: 400,
        },
      );
    }

    if (!clientId) {
      return NextResponse.json(
        {
          error:
            "client_id e obrigatorio.",
        },
        {
          status: 400,
        },
      );
    }

    if (clientId.length > 200) {
      return NextResponse.json(
        {
          error:
            "client_id invalido.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * SDP costuma ter poucos KB.
     * Impede payload absurdo sem limitar
     * negociacoes WebRTC normais.
     */
    if (sdpOffer.length > 131072) {
      return NextResponse.json(
        {
          error:
            "sdp_offer excede o limite permitido.",
        },
        {
          status: 413,
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
              calls.id,
              id,
            ),
            eq(
              calls.accountId,
              context.accountId,
            ),
          ),
        )
        .limit(1);

    if (!call) {
      return NextResponse.json(
        {
          error:
            "Chamada nao encontrada.",
        },
        {
          status: 404,
        },
      );
    }

    if (
      terminalStates.has(
        call.state,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "A chamada ja esta encerrada.",
          state:
            call.state,
        },
        {
          status: 409,
        },
      );
    }

    if (
      !call.providerCallId
    ) {
      return NextResponse.json(
        {
          error:
            "Chamada sem provider_call_id.",
        },
        {
          status: 409,
        },
      );
    }

    if (!call.voiceChannelId) {
      return NextResponse.json(
        {
          error:
            "Chamada sem canal de voz.",
        },
        {
          status: 409,
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
              call.voiceChannelId,
            ),
            eq(
              voiceChannels.accountId,
              context.accountId,
            ),
          ),
        )
        .limit(1);

    if (!channel) {
      return NextResponse.json(
        {
          error:
            "Canal de voz nao encontrado.",
        },
        {
          status: 404,
        },
      );
    }

    if (!channel.isActive) {
      return NextResponse.json(
        {
          error:
            "Canal de voz esta desativado.",
        },
        {
          status: 409,
        },
      );
    }

    if (
      channel.provider !==
        call.provider
    ) {
      return NextResponse.json(
        {
          error:
            "Provider da chamada diverge do canal.",
        },
        {
          status: 409,
        },
      );
    }

    const resolvedChannel =
      resolveVoiceChannelRecord(
        channel,
      );

    const provider =
      getVoiceProvider(
        call.provider,
      );

    if (
      !provider.exchangeWebRtc
    ) {
      return NextResponse.json(
        {
          error:
            "Provider nao suporta negociacao WebRTC pelo backend.",
        },
        {
          status: 409,
        },
      );
    }

    const result =
      await provider.exchangeWebRtc(
        {
          providerCallId:
            call.providerCallId,

          sdpOffer,

          clientId,
        },
        resolvedChannel.config,
      );

    if (
      !result.sdpAnswer ||
      typeof result.sdpAnswer !==
        "string"
    ) {
      return NextResponse.json(
        {
          error:
            "Provider nao retornou sdp_answer valido.",
        },
        {
          status: 502,
        },
      );
    }

    return NextResponse.json({
      ok: true,

      call_id:
        call.id,

      provider:
        call.provider,

      provider_call_id:
        call.providerCallId,

      sdp_answer:
        result.sdpAnswer,
    });
  } catch (error) {
    return handleError(
      error,
    );
  }
}