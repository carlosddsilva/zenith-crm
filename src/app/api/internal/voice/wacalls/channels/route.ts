import {
  timingSafeEqual,
} from "node:crypto";

import {
  NextResponse,
} from "next/server";

import {
  getActiveWaCallsInboundChannels,
} from "@/lib/voice/channel-store";

export const runtime =
  "nodejs";

function safeEqual(
  left:
    string,
  right:
    string,
) {
  const leftBuffer =
    Buffer.from(
      left,
    );

  const rightBuffer =
    Buffer.from(
      right,
    );

  if (
    leftBuffer.length !==
    rightBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    leftBuffer,
    rightBuffer,
  );
}

export async function GET(
  request:
    Request,
) {
  const expectedToken =
    process.env
      .VOICE_WEBHOOK_TOKEN;

  if (!expectedToken) {
    return NextResponse.json(
      {
        error:
          "VOICE_WEBHOOK_TOKEN is not configured",
      },
      {
        status: 500,
      },
    );
  }

  const providedToken =
    request.headers.get(
      "x-zenith-webhook-token",
    ) ?? "";

  if (
    !safeEqual(
      providedToken,
      expectedToken,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  const channels =
    await getActiveWaCallsInboundChannels();

  const data =
    channels.flatMap(
      (channel) => {
        if (
          channel.config.provider !==
          "wacalls"
        ) {
          return [];
        }

        return [
          {
            channelId:
              channel.id,

            baseUrl:
              channel.config.baseUrl,

            sessionId:
              channel.config.sessionId,

            apiKey:
              channel.config.apiKey,
          },
        ];
      },
    );

  return NextResponse.json({
    ok:
      true,

    channels:
      data,
  });
}
