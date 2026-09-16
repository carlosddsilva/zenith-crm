import {
  eq,
} from "drizzle-orm";

import {
  NextResponse,
} from "next/server";

import {
  getZenithAccountContext,
  requireZenithRole,
} from "@/lib/auth/zenith-account";

import { apiErrorResponse } from "@/lib/api/error-response";

import {
  db,
} from "@/lib/db/client";

import {
  voiceChannels,
} from "@/lib/db/schema";

import {
  encryptVoiceCredentials,
} from "@/lib/voice";

function handleError(
  error: unknown,
) {
  if (typeof error === "object" && error !== null && "status" in error) {
    return apiErrorResponse(error, "[voice channels]");
  }

  console.error(
    "[voice channels]",
    {
      errorCode: error instanceof Error ? error.name : "UnknownError",
    },
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
          "Ja existe um canal com esse nome ou outro canal preferencial.",
      },
      {
        status: 409,
      },
    );
  }

  return NextResponse.json(
    {
      error: "Internal server error",
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

    const rows =
      await db
        .select()
        .from(
          voiceChannels,
        )
        .where(
          eq(
            voiceChannels.accountId,
            context.accountId,
          ),
        )
        .orderBy(
          voiceChannels.priority,
          voiceChannels.createdAt,
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
              channel.config,

            is_active:
              channel.isActive,

            is_default:
              channel.isDefault,

            allow_inbound:
              channel.allowInbound,

            allow_outbound:
              channel.allowOutbound,

            priority:
              channel.priority,

            max_concurrent_calls:
              channel.maxConcurrentCalls,

            health_status:
              channel.healthStatus,

            last_health_at:
              channel.lastHealthAt,

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

        provider?:
          "wacalls" |
          "asterisk";

        config?:
          Record<
            string,
            unknown
          >;

        credentials?:
          Record<
            string,
            unknown
          >;

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
      body.name?.trim();

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

    const provider =
      body.provider;

    if (
      provider !==
        "wacalls" &&
      provider !==
        "asterisk"
    ) {
      return NextResponse.json(
        {
          error:
            "Provider de voz invalido.",
        },
        {
          status: 400,
        },
      );
    }

    const priority =
      body.priority ??
      100;

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

    const defaultCapacity =
      provider ===
        "wacalls"
        ? 8
        : 30;

    const maxConcurrentCalls =
      body.max_concurrent_calls ??
      defaultCapacity;

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

    let config:
      Record<
        string,
        string |
        number |
        boolean |
        null
      >;

    let encrypted:
      string | null =
      null;

    if (
      provider ===
      "wacalls"
    ) {
      const baseUrl =
        typeof body.config
          ?.base_url ===
          "string"
          ? body.config.base_url
              .trim()
              .replace(
                /\/+$/,
                "",
              )
          : "";

      const sessionId =
        typeof body.config
          ?.session_id ===
          "string"
          ? body.config.session_id
              .trim()
          : "";

      if (
        !baseUrl ||
        !sessionId
      ) {
        return NextResponse.json(
          {
            error:
              "base_url e session_id sao obrigatorios para WaCalls.",
          },
          {
            status: 400,
          },
        );
      }

      config = {
        baseUrl,
        sessionId,
      };

      const apiKey =
        typeof body.credentials
          ?.api_key ===
          "string"
          ? body.credentials.api_key
              .trim()
          : "";

      if (apiKey) {
        encrypted =
          encryptVoiceCredentials({
            apiKey,
          });
      }
    } else {
      const ariBaseUrl =
        typeof body.config
          ?.ari_base_url ===
          "string"
          ? body.config.ari_base_url
              .trim()
              .replace(
                /\/+$/,
                "",
              )
          : "";

      const stasisApp =
        typeof body.config
          ?.stasis_app ===
          "string"
          ? body.config.stasis_app
              .trim()
          : "";

      const trunkEndpoint =
        typeof body.config
          ?.trunk_endpoint ===
          "string"
          ? body.config.trunk_endpoint
              .trim()
          : "";

      const webrtcWsUrl =
        typeof body.config
          ?.webrtc_ws_url ===
          "string"
          ? body.config.webrtc_ws_url
              .trim()
          : "";

      const sipDomain =
        typeof body.config
          ?.sip_domain ===
          "string"
          ? body.config.sip_domain
              .trim()
          : null;

      const callerId =
        typeof body.config
          ?.caller_id ===
          "string"
          ? body.config.caller_id
              .trim()
          : null;

      const ariUsername =
        typeof body.credentials
          ?.ari_username ===
          "string"
          ? body.credentials.ari_username
              .trim()
          : "";

      const ariPassword =
        typeof body.credentials
          ?.ari_password ===
          "string"
          ? body.credentials.ari_password
          : "";

      if (
        !ariBaseUrl ||
        !stasisApp ||
        !trunkEndpoint ||
        !webrtcWsUrl
      ) {
        return NextResponse.json(
          {
            error:
              "ari_base_url, stasis_app, trunk_endpoint e webrtc_ws_url sao obrigatorios para Asterisk.",
          },
          {
            status: 400,
          },
        );
      }

      if (
        !ariUsername ||
        !ariPassword
      ) {
        return NextResponse.json(
          {
            error:
              "ari_username e ari_password sao obrigatorios para Asterisk.",
          },
          {
            status: 400,
          },
        );
      }

      config = {
        ariBaseUrl,
        stasisApp,
        trunkEndpoint,
        webrtcWsUrl,
        sipDomain,
        callerId,
      };

      encrypted =
        encryptVoiceCredentials({
          ariUsername,
          ariPassword,
        });
    }

    const created =
      await db.transaction(
        async (tx) => {
          const isDefault =
            body.is_default ??
            false;

          if (isDefault) {
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
              .insert(
                voiceChannels,
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
                  encrypted,

                isActive:
                  body.is_active ??
                  true,

                isDefault,

                allowInbound:
                  body.allow_inbound ??
                  true,

                allowOutbound:
                  body.allow_outbound ??
                  true,

                priority,

                maxConcurrentCalls,
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

          is_active:
            created.isActive,

          is_default:
            created.isDefault,

          allow_inbound:
            created.allowInbound,

          allow_outbound:
            created.allowOutbound,

          priority:
            created.priority,

          max_concurrent_calls:
            created.maxConcurrentCalls,

          health_status:
            created.healthStatus,

          has_credentials:
            Boolean(
              created.credentialsEncrypted,
            ),
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

