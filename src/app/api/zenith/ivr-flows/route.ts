import {
  desc,
  eq,
  inArray,
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
  ivrFlowVersions,
} from "@/lib/db/schema";

function handleError(
  error: unknown,
) {
  console.error(
    "[ivr flows]",
    error,
  );

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

  return NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "Falha interna ao processar fluxos IVR.",
    },
    {
      status: 500,
    },
  );
}

export async function GET() {
  try {
    const context =
      await getZenithAccountContext();

    const flows =
      await db
        .select()
        .from(
          ivrFlows,
        )
        .where(
          eq(
            ivrFlows.accountId,
            context.accountId,
          ),
        )
        .orderBy(
          desc(
            ivrFlows.updatedAt,
          ),
        );

    if (
      flows.length === 0
    ) {
      return NextResponse.json({
        items: [],
      });
    }

    const versions =
      await db
        .select()
        .from(
          ivrFlowVersions,
        )
        .where(
          inArray(
            ivrFlowVersions.flowId,

            flows.map(
              (flow) =>
                flow.id,
            ),
          ),
        );

    const items =
      flows.map(
        (flow) => {
          const ownVersions =
            versions.filter(
              (version) =>
                version.flowId ===
                flow.id,
            );

          const draft =
            ownVersions.find(
              (version) =>
                version.status ===
                "draft",
            ) ?? null;

          const published =
            ownVersions.find(
              (version) =>
                version.status ===
                "published",
            ) ?? null;

          return {
            id:
              flow.id,

            name:
              flow.name,

            description:
              flow.description,

            status:
              flow.status,

            draft_version:
              draft?.version ??
              null,

            published_version:
              published?.version ??
              null,

            has_draft:
              Boolean(
                draft,
              ),

            has_published:
              Boolean(
                published,
              ),

            created_at:
              flow.createdAt,

            updated_at:
              flow.updatedAt,
          };
        },
      );

    return NextResponse.json({
      items,
    });
  } catch (error) {
    return handleError(
      error,
    );
  }
}

export async function POST(
  request: Request,
) {
  try {
    const context =
      await requireZenithRole(
        "admin",
      );

    const body =
      (await request.json()) as {
        name?:
          string;

        description?:
          string | null;
      };

    const name =
      body.name?.trim();

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

    const result =
      await db.transaction(
        async (tx) => {
          const [flow] =
            await tx
              .insert(
                ivrFlows,
              )
              .values({
                accountId:
                  context.accountId,

                createdByUserId:
                  context.userId,

                name,

                description:
                  body.description
                    ?.trim() ||
                  null,

                status:
                  "draft",
              })
              .returning();

          const [version] =
            await tx
              .insert(
                ivrFlowVersions,
              )
              .values({
                flowId:
                  flow.id,

                createdByUserId:
                  context.userId,

                version:
                  1,

                status:
                  "draft",

                definition: {
                  nodes: [
                    {
                      id:
                        "start",

                      type:
                        "trigger.inbound",

                      position: {
                        x: 100,
                        y: 100,
                      },

                      data: {},
                    },
                  ],

                  edges: [],

                  viewport: {
                    x: 0,
                    y: 0,
                    zoom: 1,
                  },

                  settings: {
                    providers: [],
                    maxSteps: 100,
                  },
                },
              })
              .returning();

          return {
            flow,
            version,
          };
        },
      );

    return NextResponse.json(
      {
        item: {
          id:
            result.flow.id,

          name:
            result.flow.name,

          description:
            result.flow.description,

          status:
            result.flow.status,

          draft_version:
            result.version.version,

          definition:
            result.version.definition,

          created_at:
            result.flow.createdAt,

          updated_at:
            result.flow.updatedAt,
        },
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return handleError(
      error,
    );
  }
}
