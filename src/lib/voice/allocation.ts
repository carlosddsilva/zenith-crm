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
  callEvents,
  calls,
  voiceChannels,
} from "@/lib/db/schema";

import {
  resolveVoiceChannelRecord,
} from "./channel-store";

import {
  VoiceProviderError,
} from "./types";

export async function reserveOutboundVoiceCall(
  input: {
    accountId:
      string;

    userId:
      string;

    contactId?:
      string | null;

    to:
      string;

    from?:
      string | null;

    provider?:
      "wacalls" |
      "asterisk";
  },
) {
  return db.transaction(
    async (tx) => {
      /*
       * Serializa somente a alocacao
       * de canais deste tenant.
       *
       * Isso impede corrida:
       *
       * request A -> ultimo slot livre
       * request B -> mesmo slot livre
       */
      await tx.execute(
        sql`
          SELECT pg_advisory_xact_lock(
            hashtext(${input.accountId})::bigint
          )
        `,
      );

      /*
       * Um agente pode operar somente
       * uma chamada simultaneamente.
       *
       * Outros agentes do tenant continuam
       * livres para utilizar a mesma sessao
       * ou outros canais.
       */
      const [agentBusy] =
        await tx
          .select({
            id:
              calls.id,
          })
          .from(calls)
          .where(
            and(
              eq(
                calls.accountId,
                input.accountId,
              ),

              eq(
                calls.assignedAgentId,
                input.userId,
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
          .limit(1);

      if (agentBusy) {
        throw new VoiceProviderError(
          "voice_agent_busy",
          "Este operador ja possui uma chamada em andamento.",
          409,
        );
      }

      const channels =
        await tx
          .select()
          .from(
            voiceChannels,
          )
          .where(
            and(
              eq(
                voiceChannels.accountId,
                input.accountId,
              ),

              eq(
                voiceChannels.isActive,
                true,
              ),

              eq(
                voiceChannels.allowOutbound,
                true,
              ),

              ne(
                voiceChannels.healthStatus,
                "offline",
              ),

              ...(input.provider
                ? [
                    eq(
                      voiceChannels.provider,
                      input.provider,
                    ),
                  ]
                : []),
            ),
          );

      if (
        channels.length === 0
      ) {
        throw new VoiceProviderError(
          "voice_channel_unavailable",
          "Nenhum canal de voz outbound esta disponivel para esta conta.",
          409,
        );
      }

      const activeRows =
        await tx
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
                input.accountId,
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
        channels
          .map(
            (channel) =>
              resolveVoiceChannelRecord(
                channel,
                activeMap.get(
                  channel.id,
                ) ?? 0,
              ),
          )
          .filter(
            (channel) =>
              channel.availableSlots >
              0,
          );

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

      const selected =
        pool[0];

      if (!selected) {
        throw new VoiceProviderError(
          "voice_capacity_exhausted",
          "Todos os canais de voz outbound desta conta estao ocupados.",
          409,
        );
      }

      const now =
        new Date();

      /*
       * Criar a call como NEW ja reserva
       * uma unidade da capacidade do canal.
       */
      const [call] =
        await tx
          .insert(calls)
          .values({
            accountId:
              input.accountId,

            voiceChannelId:
              selected.id,

            provider:
              selected.provider,

            direction:
              "outbound",

            state:
              "new",

            contactId:
              input.contactId ??
              null,

            assignedAgentId:
              input.userId,

            createdByUserId:
              input.userId,

            fromPhone:
              input.from ??
              null,

            toPhone:
              input.to,

            startedAt:
              now,
          })
          .returning();

      await tx
        .insert(
          callEvents,
        )
        .values({
          callId:
            call.id,

          eventType:
            "call.requested",

          state:
            "new",

          occurredAt:
            now,

          payload: {
            to:
              input.to,

            from:
              input.from ??
              null,

            voiceChannelId:
              selected.id,

            channelName:
              selected.name,

            capacity: {
              activeBefore:
                selected.activeCalls,

              max:
                selected.maxConcurrentCalls,
            },
          },
        });

      return {
        call,
        channel:
          selected,
      };
    },
  );
}



