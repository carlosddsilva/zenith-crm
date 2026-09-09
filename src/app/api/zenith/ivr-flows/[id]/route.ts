import {
  and,
  eq,
} from "drizzle-orm";

import {
  NextResponse,
} from "next/server";

import {
  getZenithAccountContext,
  requireZenithRole,
} from "@/lib/auth/zenith-account";

import {
  db,
} from "@/lib/db/client";

import {
  ivrFlows,
} from "@/lib/db/schema";

import {
  getCurrentIvrVersion,
  IvrFlowError,
} from "@/lib/ivr";

function handleError(
  error: unknown,
) {
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

  const code =
    typeof error ===
      "object" &&
    error !== null &&
    "code" in error
      ? String(
          (
            error as {
              code?: unknown;
            }
          ).code,
        )
      : null;

  if (code === "23505") {
    return NextResponse.json(
      {
        error:
          "Ja existe um fluxo IVR com este nome.",
      },
      {
        status: 409,
      },
    );
  }

  console.error(
    "[ivr flow]",
    error,
  );

  return NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "Falha interna ao processar o fluxo IVR.",
    },
    {
      status: 500,
    },
  );
}

export async function GET(
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
      await getZenithAccountContext();

    const { id } =
      await params;

    const result =
      await getCurrentIvrVersion(
        context.accountId,
        id,
      );

    return NextResponse.json({
      item: {
        flow: {
          id:
            result.flow.id,

          name:
            result.flow.name,

          description:
            result.flow.description,

          status:
            result.flow.status,

          created_at:
            result.flow.createdAt,

          updated_at:
            result.flow.updatedAt,
        },

        draft:
          result.draft,

        published:
          result.published,

        current:
          result.current,

        versions:
          result.versions.map(
            (version) => ({
              id:
                version.id,

              version:
                version.version,

              status:
                version.status,

              published_at:
                version.publishedAt,

              created_at:
                version.createdAt,
            }),
          ),
      },
    });
  } catch (error) {
    return handleError(
      error,
    );
  }
}

export async function PATCH(
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
      await requireZenithRole(
        "admin",
      );

    const { id } =
      await params;

    const body =
      (await request.json()) as {
        name?:
          string;

        description?:
          string | null;
      };

    const [current] =
      await db
        .select()
        .from(
          ivrFlows,
        )
        .where(
          and(
            eq(
              ivrFlows.id,
              id,
            ),

            eq(
              ivrFlows.accountId,
              context.accountId,
            ),
          ),
        )
        .limit(1);

    if (!current) {
      return NextResponse.json(
        {
          error:
            "Fluxo IVR nao encontrado.",
        },
        {
          status: 404,
        },
      );
    }

    if (
      current.status ===
      "archived"
    ) {
      return NextResponse.json(
        {
          error:
            "Um fluxo arquivado nao pode ser alterado.",
        },
        {
          status: 409,
        },
      );
    }

    let name =
      current.name;

    if (
      body.name !==
      undefined
    ) {
      name =
        body.name.trim();

      if (!name) {
        return NextResponse.json(
          {
            error:
              "Nome do fluxo e obrigatorio.",
          },
          {
            status: 400,
          },
        );
      }

      if (
        name.length >
        120
      ) {
        return NextResponse.json(
          {
            error:
              "Nome do fluxo deve ter no maximo 120 caracteres.",
          },
          {
            status: 400,
          },
        );
      }
    }

    const description =
      body.description !==
      undefined
        ? (
            body.description
              ?.trim() ||
            null
          )
        : current.description;

    const [updated] =
      await db
        .update(
          ivrFlows,
        )
        .set({
          name,
          description,
          updatedAt:
            new Date(),
        })
        .where(
          and(
            eq(
              ivrFlows.id,
              id,
            ),

            eq(
              ivrFlows.accountId,
              context.accountId,
            ),
          ),
        )
        .returning();

    return NextResponse.json({
      item: {
        id:
          updated.id,

        name:
          updated.name,

        description:
          updated.description,

        status:
          updated.status,

        created_at:
          updated.createdAt,

        updated_at:
          updated.updatedAt,
      },
    });
  } catch (error) {
    return handleError(
      error,
    );
  }
}
