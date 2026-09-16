import {
  NextResponse,
} from "next/server";

import {
  getZenithAccountContext,
} from "@/lib/auth/zenith-account";

import {
  getCurrentIvrVersion,
  getIvrDefinitionProviders,
  IvrDefinitionError,
  IvrFlowError,
  parseIvrFlowDefinition,
  validateIvrFlow,
} from "@/lib/ivr";

function handleError(
  error: unknown,
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
    "[ivr validate]",
    {
      errorCode: error instanceof Error ? error.name : "UnknownError",
    },
  );

  return NextResponse.json(
    {
      error:
        "Falha ao validar fluxo IVR.",
    },
    {
      status: 500,
    },
  );
}

export async function POST(
  request: Request,

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
      await getZenithAccountContext();

    const {
      id,
    } =
      await params;

    /*
     * Permite validar:
     *
     * 1. o JSON ainda nao salvo no editor;
     * 2. ou o draft/current salvo no banco.
     */
    let body: {
      definition?: unknown;
    } = {};

    try {
      body =
        (await request.json()) as {
          definition?: unknown;
        };
    } catch {
      /*
       * Body vazio e permitido.
       */
    }

    let definition;

    if (
      body.definition !==
      undefined
    ) {
      definition =
        parseIvrFlowDefinition(
          body.definition,
        );
    } else {
      const current =
        await getCurrentIvrVersion(
          context.accountId,
          id,
        );

      if (!current.current) {
        return NextResponse.json(
          {
            error:
              "Fluxo IVR nao possui nenhuma versao.",

            code:
              "ivr_version_not_found",
          },
          {
            status: 409,
          },
        );
      }

      definition =
        parseIvrFlowDefinition(
          current.current.definition,
        );
    }

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
      valid:
        validation.valid,

      providers,

      errors:
        validation.errors,

      warnings:
        validation.warnings,
    });
  } catch (error) {
    return handleError(
      error,
    );
  }
}
