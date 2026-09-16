import {
  and,
  eq,
} from "drizzle-orm";

import {
  NextResponse,
} from "next/server";

import {
  getZenithAccountContext,
  ZenithForbiddenError,
} from "@/lib/auth/zenith-account";

import {
  hasMinRole,
} from "@/lib/auth/roles";

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

type CallAction =
  | "accept"
  | "reject"
  | "hangup";

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
        error: "Falha no provedor de voz.",
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
    "[voice call action]",
    {
      errorCode: error instanceof Error ? error.name : "UnknownError",
    },
  );

  return NextResponse.json(
    {
      error: "Erro ao executar ação da chamada.",
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
      await getZenithAccountContext();

    if (
      !hasMinRole(
        context.role,
        "agent",
      )
    ) {
      throw new ZenithForbiddenError(
        "Esta operacao requer permissao agent ou superior.",
      );
    }

    const { id } =
      await params;

    let body: {
      action?: unknown;
      client_id?: unknown;
    };

    try {
      body =
        (await request.json()) as {
          action?: unknown;
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

    const action =
      typeof body.action ===
        "string"
        ? body.action.trim()
        : "";

    if (
      action !== "accept" &&
      action !== "reject" &&
      action !== "hangup"
    ) {
      return NextResponse.json(
        {
          error:
            "action deve ser accept, reject ou hangup.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * Suspensao bloqueia novos claims, mas nao pode
     * impedir o encerramento seguro de uma chamada
     * que ja estava ativa quando a conta foi suspensa.
     */
    if (
      context.isSuspended &&
      action !== "hangup"
    ) {
      return NextResponse.json(
        {
          error:
            "Empresa suspensa. Apenas o encerramento de chamada ativa e permitido.",
        },
        {
          status: 403,
        },
      );
    }

    const clientId =
      typeof body.client_id ===
        "string"
        ? body.client_id.trim()
        : "";

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
      !call.providerCallId
    ) {
      return NextResponse.json(
        {
          error:
            "Chamada ainda nao possui provider_call_id.",
        },
        {
          status: 409,
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
      call.assignedAgentId &&
      call.assignedAgentId !==
        context.userId
    ) {
      return NextResponse.json(
        {
          error:
            "A chamada pertence a outro operador.",
        },
        {
          status: 409,
        },
      );
    }

    if (
      (
        action === "accept" ||
        action === "reject"
      ) &&
      call.direction !==
        "inbound"
    ) {
      return NextResponse.json(
        {
          error:
            "Esta acao e permitida apenas para chamadas inbound.",
        },
        {
          status: 409,
        },
      );
    }

    if (
      (
        action === "accept" ||
        action === "reject"
      ) &&
      call.state !==
        "ringing" &&
      call.state !==
        "connecting"
    ) {
      return NextResponse.json(
        {
          error:
            "A chamada nao esta aguardando atendimento.",
          state:
            call.state,
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
            "Canal de voz da chamada nao encontrado.",
        },
        {
          status: 404,
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

    const providerRequest = {
      providerCallId:
        call.providerCallId,
      clientId,
    };

    switch (
      action as CallAction
    ) {
      case "accept":
        await provider.acceptCall(
          providerRequest,
          resolvedChannel.config,
        );

        /*
         * O provider confirmou o claim.
         * Vincula a chamada ao operador Zenith
         * que efetivamente conseguiu atende-la.
         */
        await db
          .update(calls)
          .set({
            assignedAgentId:
              context.userId,

            updatedAt:
              new Date(),
          })
          .where(
            and(
              eq(
                calls.id,
                call.id,
              ),

              eq(
                calls.accountId,
                context.accountId,
              ),
            ),
          );

        break;

      case "reject":
        await provider.rejectCall(
          providerRequest,
          resolvedChannel.config,
        );
        break;

      case "hangup":
        await provider.hangupCall(
          providerRequest,
          resolvedChannel.config,
        );
        break;
    }

    /*
     * Nao alteramos o state local aqui.
     *
     * O SSE do provider continua sendo
     * a fonte de verdade para ringing,
     * active, rejected/ended etc.
     */
    return NextResponse.json({
      ok: true,
      call_id:
        call.id,
      provider:
        call.provider,
      provider_call_id:
        call.providerCallId,
      action,
      state:
        call.state,
    });
  } catch (error) {
    return handleError(
      error,
    );
  }
}
