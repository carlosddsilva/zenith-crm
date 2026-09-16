import {
  NextResponse,
} from "next/server";

import {
  requireZenithRole,
} from "@/lib/auth/zenith-account";

import {
  getIvrDefinitionProviders,
  IvrDefinitionError,
  IvrFlowError,
  parseIvrFlowDefinition,
  saveIvrDraft,
  validateIvrFlow,
} from "@/lib/ivr";

function handleError(
  error:
    unknown,
) {
  if (
    error instanceof
    IvrDefinitionError
  ) {
    return NextResponse.json(
      {
        error:
          error.message,

        code:
          "ivr_definition_invalid",
      },
      {
        status: 400,
      },
    );
  }

  if (
    error instanceof
    IvrFlowError
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

  console.error(
    "[ivr draft]",
    {
      errorCode: error instanceof Error ? error.name : "UnknownError",
    },
  );

  return NextResponse.json(
    {
      error:
        "Falha ao salvar rascunho do IVR.",
    },
    {
      status: 500,
    },
  );
}

export async function PUT(
  request:
    Request,

  {
    params,
  }: {
    params:
      Promise<{
        id: string;
      }>;
  },
) {
  try {
    const context =
      await requireZenithRole(
        "admin",
      );

    const {
      id,
    } =
      await params;

    const body =
      (await request.json()) as {
        definition?:
          unknown;
      };

    if (
      body.definition ===
      undefined
    ) {
      return NextResponse.json(
        {
          error:
            "definition e obrigatorio.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * Parser estrutural:
     * impede node types/providers invalidos
     * antes de tocar no banco.
     */
    const definition =
      parseIvrFlowDefinition(
        body.definition,
      );

    /*
     * Salva mesmo que ainda existam
     * erros logicos/capability.
     *
     * Isso e importante porque o usuario
     * precisa conseguir salvar um fluxo
     * incompleto enquanto edita.
     */
    const draft =
      await saveIvrDraft({
        accountId:
          context.accountId,

        userId:
          context.userId,

        flowId:
          id,

        definition,
      });

    const providers =
      getIvrDefinitionProviders(
        definition,
      );

    const validation =
      validateIvrFlow(
        definition,
        providers,
      );

    return NextResponse.json({
      ok:
        true,

      item: {
        id:
          draft.id,

        flow_id:
          draft.flowId,

        version:
          draft.version,

        status:
          draft.status,

        definition:
          draft.definition,

        created_at:
          draft.createdAt,
      },

      validation,
    });
  } catch (error) {
    return handleError(
      error,
    );
  }
}
