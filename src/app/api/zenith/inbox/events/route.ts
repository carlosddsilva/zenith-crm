import {
  getZenithAccountContext,
} from "@/lib/auth/zenith-account";

import {
  createInboxSubscriber,
  inboxRedisChannel,
} from "@/lib/realtime";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export async function GET(
  request: Request,
) {
  const context =
    await getZenithAccountContext();

  const redis =
    createInboxSubscriber();

  const redisChannel =
    inboxRedisChannel(
      context.accountId,
    );

  const encoder =
    new TextEncoder();

  let closed = false;

  let heartbeat:
    ReturnType<
      typeof setInterval
    > | null = null;

  let cleanup:
    (() => Promise<void>) |
    null = null;

  const stream =
    new ReadableStream<
      Uint8Array
    >({
      async start(
        controller,
      ) {
        const send = (
          value: string,
        ) => {
          if (closed) {
            return;
          }

          try {
            controller.enqueue(
              encoder.encode(
                value,
              ),
            );
          } catch {
            closed = true;
          }
        };

        const messageHandler =
          (
            channel: string,
            message: string,
          ) => {
            if (
              channel !==
              redisChannel
            ) {
              return;
            }

            send(
              `data: ${message}\n\n`,
            );
          };

        cleanup =
          async () => {
            if (closed) {
              return;
            }

            closed = true;

            if (heartbeat) {
              clearInterval(
                heartbeat,
              );

              heartbeat =
                null;
            }

            redis.off(
              "message",
              messageHandler,
            );

            try {
              await redis.unsubscribe(
                redisChannel,
              );
            } catch {
              // conexão já encerrada
            }

            try {
              redis.disconnect();
            } catch {
              // conexão já encerrada
            }

            try {
              controller.close();
            } catch {
              // stream já fechado
            }
          };

        redis.on(
          "error",
          (error) => {
            console.error(
              "[inbox sse redis]",
              error,
            );
          },
        );

        redis.on(
          "message",
          messageHandler,
        );

        await redis.subscribe(
          redisChannel,
        );

        send(
          `event: ready\ndata: ${JSON.stringify({
            ok: true,
          })}\n\n`,
        );

        heartbeat =
          setInterval(
            () => {
              send(
                `: heartbeat ${Date.now()}\n\n`,
              );
            },
            25000,
          );

        request.signal
          .addEventListener(
            "abort",
            () => {
              void cleanup?.();
            },
            {
              once: true,
            },
          );
      },

      cancel() {
        void cleanup?.();
      },
    });

  return new Response(
    stream,
    {
      headers: {
        "Content-Type":
          "text/event-stream",

        "Cache-Control":
          "no-cache, no-transform",

        Connection:
          "keep-alive",

        "X-Accel-Buffering":
          "no",
      },
    },
  );
}
