import {
  and,
  desc,
  eq,
  sql,
} from "drizzle-orm";

import {
  db,
} from "@/lib/db/client";

import {
  ivrExecutions,
  ivrExecutionSteps,
} from "@/lib/db/schema";

export interface ResolveWaitingIvrPlaybackInput {
  voiceChannelId:
    string;

  playbackId:
    string;
}

export interface ResolvedWaitingIvrPlayback {
  executionId:
    string;

  callId:
    string;

  provider:
    "wacalls" | "asterisk";

  context:
    Record<
      string,
      unknown
    >;

  playbackId:
    string;
}

export async function resolveWaitingIvrPlayback(
  input:
    ResolveWaitingIvrPlaybackInput,
): Promise<
  ResolvedWaitingIvrPlayback | null
> {
  const playbackId =
    input.playbackId.trim();

  if (!playbackId) {
    return null;
  }

  const [row] =
    await db
      .select({
        executionId:
          ivrExecutions.id,

        callId:
          ivrExecutions.callId,

        provider:
          ivrExecutions.provider,

        context:
          ivrExecutions.context,

        playbackId:
          sql<string>`
            ${ivrExecutionSteps.output}
            ->> 'playbackId'
          `,
      })
      .from(
        ivrExecutionSteps,
      )
      .innerJoin(
        ivrExecutions,
        eq(
          ivrExecutions.id,
          ivrExecutionSteps.executionId,
        ),
      )
      .where(
        and(
          eq(
            ivrExecutions.voiceChannelId,
            input.voiceChannelId,
          ),

          eq(
            ivrExecutions.status,
            "waiting",
          ),

          eq(
            ivrExecutionSteps.status,
            "waiting",
          ),

          sql`
            ${ivrExecutionSteps.output}
            ->> 'playbackId'
            =
            ${playbackId}
          `,
        ),
      )
      .orderBy(
        desc(
          ivrExecutionSteps.sequence,
        ),
      )
      .limit(1);

  if (!row) {
    return null;
  }

  return {
    executionId:
      row.executionId,

    callId:
      row.callId,

    provider:
      row.provider,

    context:
      row.context &&
      typeof row.context ===
        "object" &&
      !Array.isArray(
        row.context,
      )
        ? row.context as Record<
            string,
            unknown
          >
        : {},

    playbackId:
      row.playbackId,
  };
}
