import { NextResponse } from "next/server";

import {
  asc,
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
  getZenithAccountContext,
  requireZenithRole,
} from "@/lib/auth/zenith-account";

type Provider =
  | "meta"
  | "evolution";

function isProvider(
  value: unknown,
): value is Provider {
  return (
    value === "meta" ||
    value === "evolution"
  );
}

function errorResponse(
  error: unknown,
) {
  console.error(
    "[zenith messaging-channels]",
    {
      errorCode: error instanceof Error ? error.name : "UnknownError",
    },
  );

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

  return NextResponse.json(
    {
      error:
        "Internal server error",
    },
    { status: 500 },
  );
}

function publicConfig(
  provider: Provider,
  config:
    Record<
      string,
      string | number | boolean | null
    >,
) {
  if (provider === "meta") {
    return {
      phone_number_id:
        config.phoneNumberId ??
        null,
    };
  }

  return {
    base_url:
      config.baseUrl ??
      null,

    instance_name:
      config.instanceName ??
      null,
  };
}

export async function GET() {
  try {
    const context =
      await getZenithAccountContext();

    const rows =
      await db
        .select()
        .from(
          messagingChannels,
        )
        .where(
          eq(
            messagingChannels.accountId,
            context.accountId,
          ),
        )
        .orderBy(
          asc(
            messagingChannels.name,
          ),
        );

    return NextResponse.json({
      items:
        rows.map(
          (channel) => ({
            id:
              channel.id,

            name:
              channel.name,

            provider:
              channel.provider,

            config:
              publicConfig(
                channel.provider,
                channel.config,
              ),

            is_active:
              channel.isActive,

            is_default_service:
              channel.isDefaultService,

            has_credentials:
              Boolean(
                channel.credentialsEncrypted,
              ),

            created_at:
              channel.createdAt,

            updated_at:
              channel.updatedAt,
          }),
        ),
    });
  } catch (error) {
    return errorResponse(
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
        name?: string;
        provider?: string;

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

          app_secret?:
            string;

          api_key?:
            string;
        };
      };

    const name =
      body.name?.trim() ??
      "";

    if (!name) {
      return NextResponse.json(
        {
          error:
            "name is required",
        },
        { status: 400 },
      );
    }

    if (
      !isProvider(
        body.provider,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid provider",
        },
        { status: 400 },
      );
    }

    const provider: Provider =
      body.provider;

    const isActive =
      body.is_active ??
      true;

    const isDefault =
      body.is_default_service ??
      false;

    if (
      isDefault &&
      !isActive
    ) {
      return NextResponse.json(
        {
          error:
            "O canal padrão de atendimento precisa estar ativo.",
        },
        { status: 400 },
      );
    }

    let config:
      Record<string, string>;

    let credentials:
      Record<string, string>;

    if (
      provider ===
      "meta"
    ) {
      const phoneNumberId =
        body.config
          ?.phone_number_id
          ?.trim();

      const accessToken =
        body.credentials
          ?.access_token
          ?.trim();

      const appSecret =
        body.credentials
          ?.app_secret
          ?.trim();

      if (
        !phoneNumberId ||
        !accessToken ||
        !appSecret
      ) {
        return NextResponse.json(
          {
            error:
              "phone_number_id, access_token and app_secret are required for Meta",
          },
          { status: 400 },
        );
      }

      config = {
        phoneNumberId,
      };

      credentials = {
        accessToken,
        appSecret,
      };
    } else {
      const baseUrl =
        body.config
          ?.base_url
          ?.trim()
          .replace(
            /\/+$/,
            "",
          );

      const instanceName =
        body.config
          ?.instance_name
          ?.trim();

      const apiKey =
        body.credentials
          ?.api_key
          ?.trim();

      if (
        !baseUrl ||
        !instanceName ||
        !apiKey
      ) {
        return NextResponse.json(
          {
            error:
              "base_url, instance_name and api_key are required for Evolution",
          },
          { status: 400 },
        );
      }

      config = {
        baseUrl,
        instanceName,
      };

      credentials = {
        apiKey,
      };
    }

    const created =
      await db.transaction(
        async (tx) => {
          if (isDefault) {
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
              .insert(
                messagingChannels,
              )
              .values({
                accountId:
                  context.accountId,

                createdByUserId:
                  context.userId,

                name,

                provider,

                config,

                credentialsEncrypted:
                  encryptMessagingCredentials(
                    credentials,
                  ),

                isActive,

                isDefaultService:
                  isDefault,
              })
              .returning();

          return channel;
        },
      );

    return NextResponse.json(
      {
        item: {
          id:
            created.id,

          name:
            created.name,

          provider:
            created.provider,

          config:
            publicConfig(
              created.provider,
              created.config,
            ),

          is_active:
            created.isActive,

          is_default_service:
            created.isDefaultService,

          has_credentials:
            true,

          created_at:
            created.createdAt,

          updated_at:
            created.updatedAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(
      error,
    );
  }
}


