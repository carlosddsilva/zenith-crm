import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import {
  and,
  eq,
  sql,
} from "drizzle-orm";

import {
  NextResponse,
} from "next/server";

import { db } from "@/lib/db/client";

import {
  messagingChannels,
  messages,
} from "@/lib/db/schema";

import {
  decryptMessagingCredentials,
} from "@/lib/messaging/credentials";

import {
  beginWebhookEvent,
  finishWebhookEvent,
  persistInboundMessageRealtime,
} from "@/lib/messaging";

interface MetaMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;

  text?: {
    body?: string;
  };

  image?: {
    id?: string;
    mime_type?: string;
    caption?: string;
  };

  document?: {
    id?: string;
    mime_type?: string;
    filename?: string;
    caption?: string;
  };

  audio?: {
    id?: string;
    mime_type?: string;
  };

  video?: {
    id?: string;
    mime_type?: string;
    caption?: string;
  };

  location?: {
    latitude?: number;
    longitude?: number;
    name?: string;
    address?: string;
  };

  interactive?: {
    type?: string;

    button_reply?: {
      id?: string;
      title?: string;
    };

    list_reply?: {
      id?: string;
      title?: string;
      description?: string;
    };
  };

  context?: {
    id?: string;
  };
}

interface MetaStatus {
  id?: string;
  status?: string;
}

interface MetaValue {
  metadata?: {
    phone_number_id?: string;
  };

  contacts?: Array<{
    profile?: {
      name?: string;
    };
    wa_id?: string;
  }>;

  messages?:
    MetaMessage[];

  statuses?:
    MetaStatus[];
}

function verifySignature(
  raw: string,
  signature:
    string | null,
  appSecret:
    string,
): boolean {
  if (!signature) {
    return false;
  }

  const expected =
    `sha256=${createHmac(
      "sha256",
      appSecret,
    )
      .update(raw, "utf8")
      .digest("hex")}`;

  const left =
    Buffer.from(
      signature,
      "utf8",
    );

  const right =
    Buffer.from(
      expected,
      "utf8",
    );

  if (
    left.length !==
    right.length
  ) {
    return false;
  }

  return timingSafeEqual(
    left,
    right,
  );
}

async function resolveMetaChannel(
  phoneNumberId:
    string,
) {
  const [channel] =
    await db
      .select()
      .from(
        messagingChannels,
      )
      .where(
        and(
          eq(
            messagingChannels.provider,
            "meta",
          ),

          eq(
            messagingChannels.isActive,
            true,
          ),

          sql`${messagingChannels.config}->>'phoneNumberId' = ${phoneNumberId}`,
        ),
      )
      .limit(1);

  if (!channel) {
    return null;
  }

  const credentials =
    decryptMessagingCredentials(
      channel.credentialsEncrypted,
    );

  return {
    channel,
    appSecret:
      credentials.appSecret ??
      null,
  };
}

function normalizeMetaStatus(
  value:
    string | undefined,
):
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | null {
  if (
    value === "sent" ||
    value === "delivered" ||
    value === "read" ||
    value === "failed"
  ) {
    return value;
  }

  return null;
}

function occurredAt(
  value:
    string | undefined,
): Date {
  const seconds =
    Number(value);

  if (
    Number.isFinite(seconds) &&
    seconds > 0
  ) {
    return new Date(
      seconds * 1000,
    );
  }

  return new Date();
}

export async function GET(
  request: Request,
) {
  const url =
    new URL(request.url);

  const mode =
    url.searchParams.get(
      "hub.mode",
    );

  const token =
    url.searchParams.get(
      "hub.verify_token",
    );

  const challenge =
    url.searchParams.get(
      "hub.challenge",
    );

  const expected =
    process.env
      .META_WEBHOOK_VERIFY_TOKEN;

  if (
    mode === "subscribe" &&
    expected &&
    token === expected &&
    challenge
  ) {
    return new Response(
      challenge,
      {
        status: 200,
      },
    );
  }

  return new Response(
    "Forbidden",
    {
      status: 403,
    },
  );
}

export async function POST(
  request: Request,
) {
  const raw =
    await request.text();

  let payload: unknown;

  try {
    payload =
      JSON.parse(raw);
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid JSON",
      },
      { status: 400 },
    );
  }

  const root =
    payload as {
      entry?: Array<{
        changes?: Array<{
          field?: string;
          value?: MetaValue;
        }>;
      }>;
    };

  /*
   * Um webhook Meta pode carregar
   * múltiplas changes.
   */
  for (
    const entry of
      root.entry ?? []
  ) {
    for (
      const change of
        entry.changes ?? []
    ) {
      const value =
        change.value;

      const phoneNumberId =
        value?.metadata
          ?.phone_number_id;

      if (!phoneNumberId) {
        continue;
      }

      const resolved =
        await resolveMetaChannel(
          phoneNumberId,
        );

      if (!resolved) {
        continue;
      }

      if (
        !resolved.appSecret
      ) {
        console.error(
          "[meta webhook] appSecret ausente",
          {
            channelId:
              resolved.channel.id,
          },
        );

        return NextResponse.json(
          {
            error:
              "Meta webhook security is not configured",
          },
          { status: 503 },
        );
      }

      const signature =
        request.headers.get(
          "x-hub-signature-256",
        );

      if (
        !verifySignature(
          raw,
          signature,
          resolved.appSecret,
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid Meta signature",
          },
          { status: 401 },
        );
      }

      const contactName =
        value?.contacts?.[0]
          ?.profile?.name ??
        null;

      /*
       * MENSAGENS INBOUND
       */
      for (
        const message of
          value?.messages ?? []
      ) {
        if (
          !message.id ||
          !message.from
        ) {
          continue;
        }

        const event =
          await beginWebhookEvent({
            accountId:
              resolved.channel
                .accountId,

            messagingChannelId:
              resolved.channel.id,

            provider:
              "meta",

            eventKey:
              `message:${message.id}`,

            eventType:
              `message:${message.type ?? "unknown"}`,

            rawPayload:
              raw,
          });

        if (!event) {
          continue;
        }

        try {
          const base = {
            providerMessageId:
              message.id,

            from:
              message.from,

            contactName,

            replyToProviderMessageId:
              message.context?.id ??
              null,

            occurredAt:
              occurredAt(
                message.timestamp,
              ),
          };

          if (
            message.type ===
            "text"
          ) {
            await persistInboundMessageRealtime(
              resolved.channel.id,
              {
                ...base,

                contentType:
                  "text",

                text:
                  message.text
                    ?.body ??
                  "",
              },
            );
          } else if (
            message.type ===
              "image" ||
            message.type ===
              "document" ||
            message.type ===
              "audio" ||
            message.type ===
              "video"
          ) {
            const media =
              message[
                message.type
              ];

            await persistInboundMessageRealtime(
              resolved.channel.id,
              {
                ...base,

                contentType:
                  message.type,

                text:
                  "caption" in
                    (media ?? {})
                    ? String(
                        (
                          media as {
                            caption?: string;
                          }
                        ).caption ??
                          "",
                      ) ||
                      null
                    : null,

                mediaType:
                  (
                    media as {
                      mime_type?:
                        string;
                    } | undefined
                  )?.mime_type ??
                  null,

                /*
                 * A URL real da mídia
                 * será resolvida no módulo
                 * de media download.
                 */
                mediaUrl:
                  null,

                interactivePayload:
                  {
                    meta_media_id:
                      (
                        media as {
                          id?:
                            string;
                        } | undefined
                      )?.id ??
                      null,
                  },
              },
            );
          } else if (
            message.type ===
            "location"
          ) {
            await persistInboundMessageRealtime(
              resolved.channel.id,
              {
                ...base,

                contentType:
                  "location",

                text:
                  message.location
                    ?.name ??
                  message.location
                    ?.address ??
                  null,

                interactivePayload:
                  {
                    latitude:
                      message.location
                        ?.latitude ??
                      null,

                    longitude:
                      message.location
                        ?.longitude ??
                      null,

                    name:
                      message.location
                        ?.name ??
                      null,

                    address:
                      message.location
                        ?.address ??
                      null,
                  },
              },
            );
          } else if (
            message.type ===
            "interactive"
          ) {
            const reply =
              message.interactive
                ?.button_reply ??
              message.interactive
                ?.list_reply;

            await persistInboundMessageRealtime(
              resolved.channel.id,
              {
                ...base,

                contentType:
                  "interactive",

                text:
                  reply?.title ??
                  null,

                interactiveReplyId:
                  reply?.id ??
                  null,

                interactivePayload:
                  message.interactive
                    ? {
                        ...message.interactive,
                      }
                    : null,
              },
            );
          } else {
            await finishWebhookEvent(
              event.id,
              "ignored",
            );

            continue;
          }

          await finishWebhookEvent(
            event.id,
            "processed",
          );
        } catch (error) {
          await finishWebhookEvent(
            event.id,
            "failed",
            error instanceof Error
              ? error.message
              : "Unknown error",
          );

          console.error(
            "[meta inbound]",
            error,
          );
        }
      }

      /*
       * STATUS DE MENSAGENS OUTBOUND
       */
      for (
        const statusEvent of
          value?.statuses ?? []
      ) {
        if (!statusEvent.id) {
          continue;
        }

        const normalized =
          normalizeMetaStatus(
            statusEvent.status,
          );

        if (!normalized) {
          continue;
        }

        const event =
          await beginWebhookEvent({
            accountId:
              resolved.channel
                .accountId,

            messagingChannelId:
              resolved.channel.id,

            provider:
              "meta",

            eventKey:
              `status:${statusEvent.id}:${normalized}`,

            eventType:
              `status:${normalized}`,

            rawPayload:
              raw,
          });

        if (!event) {
          continue;
        }

        await db
          .update(messages)
          .set({
            status:
              normalized,

            transportError:
              normalized ===
              "failed"
                ? "Meta reported message failure"
                : null,
          })
          .where(
            and(
              eq(
                messages.messagingChannelId,
                resolved.channel.id,
              ),

              eq(
                messages.messageId,
                statusEvent.id,
              ),
            ),
          );

        await finishWebhookEvent(
          event.id,
          "processed",
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
  });
}

