import { NextResponse } from "next/server";

import {
  and,
  eq,
} from "drizzle-orm";

import { db } from "@/lib/db/client";

import {
  messagingChannels,
} from "@/lib/db/schema";

import {
  encryptMessagingCredentials,
} from "@/lib/messaging/credentials";

import {
  requireZenithRole,
} from "@/lib/auth/zenith-account";

function errorResponse(
  error: unknown,
) {
  console.error(
    "[zenith messaging-channel id]",
    error,
  );

  const code =
    typeof error === "object" &&
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
          "Já existe um canal com esse nome ou outro canal já está definido como padrão.",
      },
      { status: 409 },
    );
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (
      error as {
        status?: unknown;
      }
    ).status === "number"
  ) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Request failed",
      },
      {
        status: (
          error as {
            status: number;
          }
        ).status,
      },
    );
  }

  return NextResponse.json(
    {
      error:
        "Internal server error",
    },
    { status: 500 },
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
          messagingChannels,
        )
        .where(
          and(
            eq(
              messagingChannels.id,
              id,
            ),
            eq(
              messagingChannels.accountId,
              context.accountId,
            ),
          ),
        )
        .limit(1);

    if (!current) {
      return NextResponse.json(
        {
          error:
            "Canal não encontrado.",
        },
        { status: 404 },
      );
    }

    const body =
      (await request.json()) as {
        name?: string;

        is_active?: boolean;

        is_default_service?:
          boolean;

        config?: {
          phone_number_id?:
            string;

          base_url?:
            string;

          instance_name?:
            string;
        };

        credentials?: {
          access_token?:
            string;

          api_key?:
            string;
        };
      };

    const name =
      body.name !== undefined
        ? body.name.trim()
        : current.name;

    if (!name) {
      return NextResponse.json(
        {
          error:
            "O nome do canal é obrigatório.",
        },
        { status: 400 },
      );
    }

    const nextActive =
      body.is_active ??
      current.isActive;

    let nextDefault =
      body.is_default_service ??
      current.isDefaultService;

    /*
     * Um canal inativo não pode permanecer
     * como padrão de atendimento.
     */
    if (!nextActive) {
      nextDefault = false;
    }

    const nextConfig = {
      ...current.config,
    };

    let credentialsEncrypted:
      string | undefined;

    if (
      current.provider ===
      "meta"
    ) {
      if (
        body.config
          ?.phone_number_id !==
        undefined
      ) {
        const phoneNumberId =
          body.config.phone_number_id.trim();

        if (!phoneNumberId) {
          return NextResponse.json(
            {
              error:
                "phone_number_id não pode ficar vazio.",
            },
            { status: 400 },
          );
        }

        nextConfig.phoneNumberId =
          phoneNumberId;
      }

      if (
        body.credentials
          ?.access_token !==
        undefined
      ) {
        const accessToken =
          body.credentials.access_token.trim();

        if (!accessToken) {
          return NextResponse.json(
            {
              error:
                "access_token não pode ficar vazio.",
            },
            { status: 400 },
          );
        }

        credentialsEncrypted =
          encryptMessagingCredentials({
            accessToken,
          });
      }
    } else {
      if (
        body.config
          ?.base_url !==
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
                "base_url não pode ficar vazia.",
            },
            { status: 400 },
          );
        }

        nextConfig.baseUrl =
          baseUrl;
      }

      if (
        body.config
          ?.instance_name !==
        undefined
      ) {
        const instanceName =
          body.config.instance_name.trim();

        if (!instanceName) {
          return NextResponse.json(
            {
              error:
                "instance_name não pode ficar vazio.",
            },
            { status: 400 },
          );
        }

        nextConfig.instanceName =
          instanceName;
      }

      if (
        body.credentials
          ?.api_key !==
        undefined
      ) {
        const apiKey =
          body.credentials.api_key.trim();

        if (!apiKey) {
          return NextResponse.json(
            {
              error:
                "api_key não pode ficar vazia.",
            },
            { status: 400 },
          );
        }

        credentialsEncrypted =
          encryptMessagingCredentials({
            apiKey,
          });
      }
    }

    const updated =
      await db.transaction(
        async (tx) => {
          if (nextDefault) {
            await tx
              .update(
                messagingChannels,
              )
              .set({
                isDefaultService:
                  false,

                updatedAt:
                  new Date(),
              })
              .where(
                eq(
                  messagingChannels.accountId,
                  context.accountId,
                ),
              );
          }

          const [channel] =
            await tx
              .update(
                messagingChannels,
              )
              .set({
                name,

                config:
                  nextConfig,

                isActive:
                  nextActive,

                isDefaultService:
                  nextDefault,

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
                    messagingChannels.id,
                    id,
                  ),
                  eq(
                    messagingChannels.accountId,
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

        is_default_service:
          updated.isDefaultService,

        has_credentials:
          true,

        updated_at:
          updated.updatedAt,
      },
    });
  } catch (error) {
    return errorResponse(
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
          messagingChannels,
        )
        .where(
          and(
            eq(
              messagingChannels.id,
              id,
            ),
            eq(
              messagingChannels.accountId,
              context.accountId,
            ),
          ),
        )
        .returning({
          id:
            messagingChannels.id,
        });

    if (!deleted) {
      return NextResponse.json(
        {
          error:
            "Canal não encontrado.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      id: deleted.id,
    });
  } catch (error) {
    return errorResponse(
      error,
    );
  }
}
