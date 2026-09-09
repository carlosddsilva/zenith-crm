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
  voiceChannels,
} from "@/lib/db/schema";

import {
  encryptVoiceCredentials,
} from "@/lib/voice";

function getPostgresErrorCode(
  error: unknown,
): string | undefined {
  let current:
    unknown = error;

  const visited =
    new Set<unknown>();

  while (
    typeof current ===
      "object" &&
    current !== null &&
    !visited.has(current)
  ) {
    visited.add(
      current,
    );

    if (
      "code" in current
    ) {
      const code =
        (
          current as {
            code?: unknown;
          }
        ).code;

      if (
        typeof code ===
        "string"
      ) {
        return code;
      }
    }

    current =
      "cause" in current
        ? (
            current as {
              cause?: unknown;
            }
          ).cause
        : undefined;
  }

  return undefined;
}

function handleError(
  error: unknown,
) {
  console.error(
    "[voice channel]",
    error,
  );

  const code =
    getPostgresErrorCode(
      error,
    );

  if (code === "23505") {
    return NextResponse.json(
      {
        error:
          "Conflito de nome ou canal preferencial.",
      },
      {
        status: 409,
      },
    );
  }

  if (code === "23503") {
    return NextResponse.json(
      {
        error:
          "Este canal possui historico de chamadas ou IVR e nao pode ser excluido. Desative o canal para preservar o historico.",
        code:
          "voice_channel_has_history",
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
          : "Erro interno.",
    },
    {
      status: 500,
    },
  );
}
export async function PATCH(
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
        "admin",
      );

    const { id } =
      await params;

    const [current] =
      await db
        .select()
        .from(
          voiceChannels,
        )
        .where(
          and(
            eq(
              voiceChannels.id,
              id,
            ),

            eq(
              voiceChannels.accountId,
              context.accountId,
            ),
          ),
        )
        .limit(1);

    if (!current) {
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

    const body =
      (await request.json()) as {
        name?:
          string;

        config?: {
          base_url?:
            string;

          session_id?:
            string | null;
        };

        credentials?: {
          api_key?:
            string;
        };

        is_active?:
          boolean;

        is_default?:
          boolean;

        allow_inbound?:
          boolean;

        allow_outbound?:
          boolean;

        priority?:
          number;

        max_concurrent_calls?:
          number;
      };

    const name =
      body.name !==
      undefined
        ? body.name.trim()
        : current.name;

    if (!name) {
      return NextResponse.json(
        {
          error:
            "Nome do canal e obrigatorio.",
        },
        {
          status: 400,
        },
      );
    }

    const priority =
      body.priority ??
      current.priority;

    const maxConcurrentCalls =
      body.max_concurrent_calls ??
      current.maxConcurrentCalls;

    if (
      !Number.isInteger(
        priority,
      ) ||
      priority < 0
    ) {
      return NextResponse.json(
        {
          error:
            "priority deve ser inteiro >= 0.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !Number.isInteger(
        maxConcurrentCalls,
      ) ||
      maxConcurrentCalls < 1
    ) {
      return NextResponse.json(
        {
          error:
            "max_concurrent_calls deve ser inteiro >= 1.",
        },
        {
          status: 400,
        },
      );
    }

    const config = {
      ...(current.config ??
        {}),
    };

    if (
      body.config?.base_url !==
      undefined
    ) {
      const baseUrl =
        body.config.base_url
          .trim()
          .replace(
            /\/+$/,
            "",
          );

      if (!baseUrl) {
        return NextResponse.json(
          {
            error:
              "base_url nao pode ficar vazia.",
          },
          {
            status: 400,
          },
        );
      }

      config.baseUrl =
        baseUrl;
    }

    if (
      body.config
        ?.session_id !==
      undefined
    ) {
      config.sessionId =
        body.config.session_id
          ?.trim() ||
        null;
    }

    let credentialsEncrypted:
      string | undefined;

    if (
      body.credentials
        ?.api_key !==
      undefined
    ) {
      const apiKey =
        body.credentials.api_key
          .trim();

      if (!apiKey) {
        return NextResponse.json(
          {
            error:
              "api_key nao pode ficar vazia.",
          },
          {
            status: 400,
          },
        );
      }

      credentialsEncrypted =
        encryptVoiceCredentials({
          apiKey,
        });
    }

    const updated =
      await db.transaction(
        async (tx) => {
          const nextDefault =
            body.is_default ??
            current.isDefault;

          if (nextDefault) {
            await tx
              .update(
                voiceChannels,
              )
              .set({
                isDefault:
                  false,

                updatedAt:
                  new Date(),
              })
              .where(
                eq(
                  voiceChannels.accountId,
                  context.accountId,
                ),
              );
          }

          const [channel] =
            await tx
              .update(
                voiceChannels,
              )
              .set({
                name,

                config,

                isActive:
                  body.is_active ??
                  current.isActive,

                isDefault:
                  nextDefault,

                allowInbound:
                  body.allow_inbound ??
                  current.allowInbound,

                allowOutbound:
                  body.allow_outbound ??
                  current.allowOutbound,

                priority,

                maxConcurrentCalls,

                ...(credentialsEncrypted
                  ? {
                      credentialsEncrypted,
                    }
                  : {}),

                updatedAt:
                  new Date(),
              })
              .where(
                and(
                  eq(
                    voiceChannels.id,
                    id,
                  ),

                  eq(
                    voiceChannels.accountId,
                    context.accountId,
                  ),
                ),
              )
              .returning();

          return channel;
        },
      );

    return NextResponse.json({
      item: {
        id:
          updated.id,

        name:
          updated.name,

        provider:
          updated.provider,

        is_active:
          updated.isActive,

        is_default:
          updated.isDefault,

        allow_inbound:
          updated.allowInbound,

        allow_outbound:
          updated.allowOutbound,

        priority:
          updated.priority,

        max_concurrent_calls:
          updated.maxConcurrentCalls,

        health_status:
          updated.healthStatus,

        has_credentials:
          Boolean(
            updated.credentialsEncrypted,
          ),
      },
    });
  } catch (error) {
    return handleError(
      error,
    );
  }
}

export async function DELETE(
  _request: Request,
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
        "admin",
      );

    const { id } =
      await params;

    const [deleted] =
      await db
        .delete(
          voiceChannels,
        )
        .where(
          and(
            eq(
              voiceChannels.id,
              id,
            ),

            eq(
              voiceChannels.accountId,
              context.accountId,
            ),
          ),
        )
        .returning({
          id:
            voiceChannels.id,
        });

    if (!deleted) {
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

    return NextResponse.json({
      ok: true,
      id:
        deleted.id,
    });
  } catch (error) {
    return handleError(
      error,
    );
  }
}

