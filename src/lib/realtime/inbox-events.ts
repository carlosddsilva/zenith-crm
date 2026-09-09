import Redis from "ioredis";

export type InboxRealtimeEvent =
  | {
      type: "message.created";
      conversationId: string;
      messageId: string;
    }
  | {
      type: "message.updated";
      conversationId: string;
      messageId: string;
    }
  | {
      type: "conversation.updated";
      conversationId: string;
    };

const globalForRedis =
  globalThis as unknown as {
    zenithRedisPublisher?: Redis;
  };

function getPublisher(): Redis {
  if (
    !globalForRedis
      .zenithRedisPublisher
  ) {
    globalForRedis
      .zenithRedisPublisher =
      new Redis(
        process.env.REDIS_URL ??
          "redis://localhost:6379",
        {
          maxRetriesPerRequest:
            null,
          enableReadyCheck:
            true,
        },
      );

    globalForRedis
      .zenithRedisPublisher.on(
        "error",
        (error) => {
          console.error(
            "[redis publisher]",
            error,
          );
        },
      );
  }

  return globalForRedis
    .zenithRedisPublisher;
}

export function inboxRedisChannel(
  accountId: string,
) {
  return `zenith:account:${accountId}:inbox`;
}

export async function publishInboxEvent(
  accountId: string,
  event:
    InboxRealtimeEvent,
) {
  const publisher =
    getPublisher();

  await publisher.publish(
    inboxRedisChannel(
      accountId,
    ),
    JSON.stringify({
      ...event,
      occurredAt:
        new Date()
          .toISOString(),
    }),
  );
}

export function createInboxSubscriber() {
  return new Redis(
    process.env.REDIS_URL ??
      "redis://localhost:6379",
    {
      maxRetriesPerRequest:
        null,
      enableReadyCheck:
        true,
    },
  );
}
