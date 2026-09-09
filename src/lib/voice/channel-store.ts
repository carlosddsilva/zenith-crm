import {
  and,
  eq,
  inArray,
  ne,
  sql,
} from "drizzle-orm";

import {
  db,
} from "@/lib/db/client";

import {
  calls,
  voiceChannels,
} from "@/lib/db/schema";

import {
  decryptVoiceCredentials,
} from "./credentials";

import type {
  VoiceProviderConfig,
  VoiceProviderId,
} from "./types";

export type VoiceDirection =
  | "inbound"
  | "outbound";

const activeCallStates = [
  "new",
  "ringing",
  "connecting",
  "active",
] as const;

export interface ResolvedVoiceChannel {
  id:
    string;

  accountId:
    string;

  name:
    string;

  provider:
    VoiceProviderId;

  isDefault:
    boolean;

  allowInbound:
    boolean;

  allowOutbound:
    boolean;

  priority:
    number;

  maxConcurrentCalls:
    number;

  healthStatus:
    "unknown" |
    "online" |
    "degraded" |
    "offline";

  activeCalls:
    number;

  availableSlots:
    number;

  utilization:
    number;

  config:
    VoiceProviderConfig;
}

export function resolveVoiceChannelRecord(
  channel:
    typeof voiceChannels.$inferSelect,
  activeCalls = 0,
): ResolvedVoiceChannel {
  const credentials =
    decryptVoiceCredentials(
      channel.credentialsEncrypted,
    );

  const config =
    channel.config ??
    {};

  const maxConcurrentCalls =
    Math.max(
      1,
      channel.maxConcurrentCalls,
    );

  const availableSlots =
    Math.max(
      0,
      maxConcurrentCalls -
        activeCalls,
    );

  let providerConfig:
    VoiceProviderConfig;

  if (
    channel.provider ===
    "wacalls"
  ) {
    providerConfig = {
      provider:
        "wacalls",

      baseUrl:
        typeof config.baseUrl ===
          "string"
          ? config.baseUrl
          : "",

      sessionId:
        typeof config.sessionId ===
          "string"
          ? config.sessionId
          : "",

      apiKey:
        credentials.apiKey ??
        null,
    };
  } else if (
    channel.provider ===
    "asterisk"
  ) {
    providerConfig = {
      provider:
        "asterisk",

      ariBaseUrl:
        typeof config.ariBaseUrl ===
          "string"
          ? config.ariBaseUrl
          : "",

      ariUsername:
        credentials.ariUsername ??
        "",

      ariPassword:
        credentials.ariPassword ??
        "",

      stasisApp:
        typeof config.stasisApp ===
          "string"
          ? config.stasisApp
          : "zenith-crm",

      trunkEndpoint:
        typeof config.trunkEndpoint ===
          "string"
          ? config.trunkEndpoint
          : "",

      webrtcWsUrl:
        typeof config.webrtcWsUrl ===
          "string"
          ? config.webrtcWsUrl
          : "",

      sipDomain:
        typeof config.sipDomain ===
          "string"
          ? config.sipDomain
          : null,

      callerId:
        typeof config.callerId ===
          "string"
          ? config.callerId
          : null,
    };
  } else {
    throw new Error(
      `Voice provider nao suportado: ${channel.provider}`,
    );
  }

  return {
    id:
      channel.id,

    accountId:
      channel.accountId,

    name:
      channel.name,

    provider:
      channel.provider,

    isDefault:
      channel.isDefault,

    allowInbound:
      channel.allowInbound,

    allowOutbound:
      channel.allowOutbound,

    priority:
      channel.priority,

    maxConcurrentCalls,

    healthStatus:
      channel.healthStatus,

    activeCalls,

    availableSlots,

    utilization:
      activeCalls /
      maxConcurrentCalls,

    config:
      providerConfig,
  };
}
export async function getVoiceChannelPool(
  accountId:
    string,
  direction:
    VoiceDirection,
): Promise<
  ResolvedVoiceChannel[]
> {
  const directionCondition =
    direction ===
    "outbound"
      ? eq(
          voiceChannels.allowOutbound,
          true,
        )
      : eq(
          voiceChannels.allowInbound,
          true,
        );

  const channels =
    await db
      .select()
      .from(
        voiceChannels,
      )
      .where(
        and(
          eq(
            voiceChannels.accountId,
            accountId,
          ),

          eq(
            voiceChannels.isActive,
            true,
          ),

          directionCondition,

          ne(
            voiceChannels.healthStatus,
            "offline",
          ),
        ),
      );

  if (
    channels.length === 0
  ) {
    return [];
  }

  const activeRows =
    await db
      .select({
        voiceChannelId:
          calls.voiceChannelId,

        activeCalls:
          sql<number>`
            count(*)::int
          `,
      })
      .from(calls)
      .where(
        and(
          eq(
            calls.accountId,
            accountId,
          ),

          inArray(
            calls.state,
            [
              "new",
              "ringing",
              "connecting",
              "active",
            ],
          ),
        ),
      )
      .groupBy(
        calls.voiceChannelId,
      );

  const activeMap =
    new Map<
      string,
      number
    >();

  for (
    const row of
      activeRows
  ) {
    activeMap.set(
      row.voiceChannelId,
      Number(
        row.activeCalls,
      ),
    );
  }

  const pool =
    channels.map(
      (channel) =>
        resolveVoiceChannelRecord(
          channel,
          activeMap.get(
            channel.id,
          ) ?? 0,
        ),
    );

  /*
   * Ordem de roteamento:
   *
   * 1. prioridade
   * 2. menor utilizacao
   * 3. default como desempate
   * 4. nome para estabilidade
   */
  pool.sort(
    (a, b) => {
      if (
        a.priority !==
        b.priority
      ) {
        return (
          a.priority -
          b.priority
        );
      }

      if (
        a.utilization !==
        b.utilization
      ) {
        return (
          a.utilization -
          b.utilization
        );
      }

      if (
        a.isDefault !==
        b.isDefault
      ) {
        return a.isDefault
          ? -1
          : 1;
      }

      return a.name.localeCompare(
        b.name,
      );
    },
  );

  return pool;
}

export async function selectVoiceChannel(
  input: {
    accountId:
      string;

    direction:
      VoiceDirection;
  },
) {
  const pool =
    await getVoiceChannelPool(
      input.accountId,
      input.direction,
    );

  return (
    pool.find(
      (channel) =>
        channel.availableSlots >
        0,
    ) ??
    null
  );
}

/*
 * Mantemos esta funcao para configuracao,
 * exibicao e fallback.
 *
 * Ela nao deve mais ser usada como
 * roteador principal de chamadas.
 */
export async function getDefaultVoiceChannel(
  accountId:
    string,
) {
  const [channel] =
    await db
      .select()
      .from(
        voiceChannels,
      )
      .where(
        and(
          eq(
            voiceChannels.accountId,
            accountId,
          ),

          eq(
            voiceChannels.isActive,
            true,
          ),

          eq(
            voiceChannels.isDefault,
            true,
          ),
        ),
      )
      .limit(1);

  if (!channel) {
    return null;
  }

  return resolveVoiceChannelRecord(
    channel,
    0,
  );
}

/*
 * Canais WaCalls que precisam manter listener
 * persistente no broker SSE do Voice Gateway.
 *
 * Nao filtramos healthStatus aqui:
 * o consumidor SSE tambem precisa ser capaz
 * de recuperar a conexao depois de uma falha.
 */
export async function getActiveWaCallsInboundChannels(): Promise<
  ResolvedVoiceChannel[]
> {
  const channels =
    await db
      .select()
      .from(
        voiceChannels,
      )
      .where(
        and(
          eq(
            voiceChannels.provider,
            "wacalls",
          ),

          eq(
            voiceChannels.isActive,
            true,
          ),

          eq(
            voiceChannels.allowInbound,
            true,
          ),
        ),
      );

  return channels.map(
    (channel) =>
      resolveVoiceChannelRecord(
        channel,
        0,
      ),
  );
}
