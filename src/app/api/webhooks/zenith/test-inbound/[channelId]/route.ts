import {
  timingSafeEqual,
} from "node:crypto";

import {
  NextResponse,
} from "next/server";

import {
  persistInboundMessageRealtime,
} from "@/lib/messaging";

function secureEquals(
  left: string,
  right: string,
) {
  const a =
    Buffer.from(left, "utf8");

  const b =
    Buffer.from(right, "utf8");

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
  /*
   * Endpoint exclusivo do ambiente
   * de desenvolvimento.
   */
  if (
    process.env.NODE_ENV ===
    "production"
  ) {
    return new Response(
      "Not Found",
      {
        status: 404,
      },
    );
  }

  const expectedToken =
    process.env
      .MESSAGING_WEBHOOK_TOKEN
      ?.trim() ?? "";

  const receivedToken =
    request.headers
      .get(
        "x-zenith-webhook-token",
      )
      ?.trim() ?? "";

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
          "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  const {
    channelId,
  } = await params;

  const body =
    (await request.json()) as {
      provider_message_id?:
        string;

      from?:
        string;

      contact_name?:
        string;

      text?:
        string;
    };

  const providerMessageId =
    body.provider_message_id
      ?.trim();

  const from =
    body.from?.trim();

  const text =
    body.text?.trim();

  if (
    !providerMessageId ||
    !from ||
    !text
  ) {
    return NextResponse.json(
      {
        error:
          "provider_message_id, from and text are required",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const result =
      await persistInboundMessageRealtime(
        channelId,
        {
          providerMessageId,

          from,

          contactName:
            body.contact_name
              ?.trim() ||
            null,

          contentType:
            "text",

          text,

          occurredAt:
            new Date(),
        },
      );

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error(
      "[test inbound]",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Inbound test failed",
      },
      {
        status: 500,
      },
    );
  }
}

