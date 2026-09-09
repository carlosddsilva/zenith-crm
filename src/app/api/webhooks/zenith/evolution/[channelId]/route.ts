import {
  createHash,
  timingSafeEqual,
} from "node:crypto";

import {
  and,
  eq,
} from "drizzle-orm";

import {
  NextResponse,
} from "next/server";

import { db } from "@/lib/db/client";

import {
  messagingChannels,
} from "@/lib/db/schema";

import {
  beginWebhookEvent,
  finishWebhookEvent,
} from "@/lib/messaging";

function secureEquals(
  left: string,
  right: string,
) {
  const a = Buffer.from(
    left,
    "utf8",
  );

  const b = Buffer.from(
    right,
    "utf8",
  );

  return (
    a.length > 0 &&
    a.length === b.length &&
    timingSafeEqual(a, b)
  );
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      channelId: string;
    }>;
  },
) {
  const { channelId } =
    await params;

  const expectedToken =
    process.env
      .MESSAGING_WEBHOOK_TOKEN
      ?.trim() ?? "";

  const url =
    new URL(request.url);

  const headerToken =
    request.headers
      .get(
        "x-zenith-webhook-token",
      )
      ?.trim() ?? "";

  const queryToken =
    url.searchParams
      .get("token")
      ?.trim() ?? "";

  const receivedToken =
    headerToken ||
    queryToken;

  if (
    !expectedToken ||
    !receivedToken ||
    !secureEquals(
      receivedToken,
      expectedToken,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Unauthorized webhook",

        diagnostic: {
          env_configured:
            expectedToken.length > 0,

          received:
            receivedToken.length > 0,

          source:
            headerToken
              ? "header"
              : queryToken
                ? "query"
                : "none",

          expected_length:
            expectedToken.length,

          received_length:
            receivedToken.length,
        },
      },
      {
        status: 401,
      },
    );
  }

  const [channel] =
    await db
      .select()
      .from(
        messagingChannels,
      )
      .where(
        and(
          eq(
            messagingChannels.id,
            channelId,
          ),

          eq(
            messagingChannels.provider,
            "evolution",
          ),

          eq(
            messagingChannels.isActive,
            true,
          ),
        ),
      )
      .limit(1);

  if (!channel) {
    return NextResponse.json(
      {
        error:
          "Evolution channel not found",
      },
      {
        status: 404,
      },
    );
  }

  const raw =
    await request.text();

  let payload:
    Record<string, unknown>;

  try {
    payload =
      JSON.parse(
        raw,
      ) as Record<
        string,
        unknown
      >;
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid JSON",
      },
      {
        status: 400,
      },
    );
  }

  const eventType =
    typeof payload.event ===
      "string"
      ? payload.event
      : "unknown";

  const eventKey =
    createHash("sha256")
      .update(
        raw,
        "utf8",
      )
      .digest("hex");

  const event =
    await beginWebhookEvent({
      accountId:
        channel.accountId,

      messagingChannelId:
        channel.id,

      provider:
        "evolution",

      eventKey,

      eventType,

      rawPayload:
        raw,
    });

  if (!event) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
    });
  }

  await finishWebhookEvent(
    event.id,
    "ignored",
  );

  return NextResponse.json({
    ok: true,

    accepted:
      true,

    parser:
      "pending-version-contract",
  });
}
