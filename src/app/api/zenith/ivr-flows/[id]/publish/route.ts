import {
  NextResponse,
} from "next/server";

import {
  requireZenithRole,
} from "@/lib/auth/zenith-account";

import {
  IvrDefinitionError,
  IvrFlowError,
  publishIvrDraft,
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
    "[ivr publish]",
    {
      errorCode: error instanceof Error ? error.name : "UnknownError",
    },
  );

  return NextResponse.json(
    {
      error:
        "Falha ao publicar fluxo IVR.",
    },
    {
      status: 500,
    },
  );
}

export async function POST(
  _request: Request,

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

    /*
     * publishIvrDraft executa novamente
     * toda a validacao no backend.
     *
     * Portanto o frontend nao consegue
     * forcar publicacao de fluxo invalido.
     */
    const result =
      await publishIvrDraft({
        accountId:
          context.accountId,

        flowId:
          id,
      });

    if (
      !result.published
    ) {
      return NextResponse.json(
        {
          published:
            false,

          error:
            "O fluxo possui erros e nao pode ser publicado.",

          validation:
            result.validation,
        },
        {
          status: 422,
        },
      );
    }

    return NextResponse.json({
      published:
        true,

      version: {
        id:
          result.version.id,

        version:
          result.version.version,

        status:
          result.version.status,

        published_at:
          result.version.publishedAt,
      },

      validation:
        result.validation,
    });
  } catch (error) {
    return handleError(
      error,
    );
  }
}
