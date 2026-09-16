import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { messagingChannels } from "@/lib/db/schema";

import { decryptMessagingCredentials } from "./credentials";
import type { MessagingProviderConfig } from "./types";

export interface ResolvedMessagingChannel {
  id: string;
  name: string;
  provider: "meta" | "evolution";
  config: MessagingProviderConfig;
}

type ChannelRow = typeof messagingChannels.$inferSelect;

function resolveChannel(channel: ChannelRow): ResolvedMessagingChannel {
  const credentials = decryptMessagingCredentials(channel.credentialsEncrypted);

  if (channel.provider === "meta") {
    const phoneNumberId = channel.config.phoneNumberId;
    const accessToken = credentials.accessToken;
    if (typeof phoneNumberId !== "string" || !phoneNumberId || !accessToken) {
      throw new Error("Invalid Meta messaging channel configuration");
    }
    return {
      id: channel.id,
      name: channel.name,
      provider: "meta",
      config: { provider: "meta", phoneNumberId, accessToken },
    };
  }

  const baseUrl = channel.config.baseUrl;
  const instanceName = channel.config.instanceName;
  const apiKey = credentials.apiKey;
  if (
    typeof baseUrl !== "string" ||
    typeof instanceName !== "string" ||
    !baseUrl ||
    !instanceName ||
    !apiKey
  ) {
    throw new Error("Invalid Evolution messaging channel configuration");
  }

  return {
    id: channel.id,
    name: channel.name,
    provider: "evolution",
    config: { provider: "evolution", baseUrl, instanceName, apiKey },
  };
}

export async function getDefaultServiceChannel(accountId: string) {
  const [channel] = await db
    .select()
    .from(messagingChannels)
    .where(
      and(
        eq(messagingChannels.accountId, accountId),
        eq(messagingChannels.isActive, true),
        eq(messagingChannels.isDefaultService, true),
      ),
    )
    .limit(1);

  return channel ? resolveChannel(channel) : null;
}

export async function getMessagingChannel(accountId: string, channelId: string) {
  const [channel] = await db
    .select()
    .from(messagingChannels)
    .where(
      and(
        eq(messagingChannels.id, channelId),
        eq(messagingChannels.accountId, accountId),
        eq(messagingChannels.isActive, true),
      ),
    )
    .limit(1);

  return channel ? resolveChannel(channel) : null;
}
