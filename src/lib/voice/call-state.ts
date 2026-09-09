import {
  and,
  eq,
} from "drizzle-orm";

import {
  db,
} from "@/lib/db/client";

import {
  callEvents,
  calls,
} from "@/lib/db/schema";

import type {
  VoiceCallState,
} from "./types";

export function sanitizeCallEndReason(reason: string | null): string | null {
  if (!reason) return null;
  const safe = [
    "user_ended",
    "declined",
    "timeout",
    "busy",
    "cancelled",
    "failed",
    "do_not_disturb",
    "unknown",
  ];
  return safe.includes(reason) ? reason : "provider_ended";
}

export function sanitizeCallFailureReason(reason: string | null): string | null {
  if (!reason) return null;
  const safe = [
    "invalid_number",
    "no_credit",
    "provider_unavailable",
    "rate_limit",
  ];
  return safe.includes(reason) ? reason : "provider_error";
}

const allowedTransitions:
  Record<
    VoiceCallState,
    VoiceCallState[]
  > = {
  new: [
    "ringing",
    "connecting",
    "active",
    "failed",
    "rejected",
    "ended",
  ],

  ringing: [
    "connecting",
    "active",
    "rejected",
    "failed",
    "ended",
  ],

  connecting: [
    "active",
    "failed",
    "ended",
  ],

  active: [
    "ended",
    "failed",
  ],

  ended: [],

  failed: [],

  rejected: [],
};

export function canTransitionCallState(
  current:
    VoiceCallState,
  next:
    VoiceCallState,
) {
  if (current === next) {
    return true;
  }

  return allowedTransitions[
    current
  ].includes(next);
}

export async function appendCallEvent(
  input: {
    accountId:
      string;

    callId:
      string;

    eventType:
      string;

    providerEventId?:
      string | null;

    payload?:
      Record<
        string,
        unknown
      > | null;

    occurredAt?:
      Date;
  },
) {
  const [call] =
    await db
      .select({
        id:
          calls.id,
      })
      .from(calls)
      .where(
        and(
          eq(
            calls.id,
            input.callId,
          ),

          eq(
            calls.accountId,
            input.accountId,
          ),
        ),
      )
      .limit(1);

  if (!call) {
    throw new Error(
      "Call not found",
    );
  }

  const [event] =
    await db
      .insert(
        callEvents,
      )
      .values({
        callId:
          call.id,

        eventType:
          input.eventType,

        state:
          null,

        providerEventId:
          input.providerEventId ??
          null,

        payload:
          input.payload ??
          null,

        occurredAt:
          input.occurredAt ??
          new Date(),
      })
      .onConflictDoNothing()
      .returning();

  return event ?? null;
}

export async function transitionCallState(
  input: {
    accountId:
      string;

    callId:
      string;

    nextState:
      VoiceCallState;

    eventType:
      string;

    providerEventId?:
      string | null;

    payload?:
      Record<
        string,
        unknown
      > | null;

    occurredAt?:
      Date;

    failureReason?:
      string | null;

    endReason?:
      string | null;
  },
) {
  return db.transaction(
    async (tx) => {
      const [current] =
        await tx
          .select()
          .from(calls)
          .where(
            and(
              eq(
                calls.id,
                input.callId,
              ),

              eq(
                calls.accountId,
                input.accountId,
              ),
            ),
          )
          .limit(1);

      if (!current) {
        throw new Error(
          "Call not found",
        );
      }

      if (
        !canTransitionCallState(
          current.state,
          input.nextState,
        )
      ) {
        throw new Error(
          `Invalid call transition: ${current.state} -> ${input.nextState}`,
        );
      }

      const occurredAt =
        input.occurredAt ??
        new Date();

      const timestamps:
        Record<
          string,
          Date
        > = {};

      if (
        input.nextState ===
          "ringing" &&
        !current.ringingAt
      ) {
        timestamps.ringingAt =
          occurredAt;
      }

      if (
        input.nextState ===
          "active" &&
        !current.answeredAt
      ) {
        timestamps.answeredAt =
          occurredAt;
      }

      if (
        (
          input.nextState ===
            "ended" ||
          input.nextState ===
            "failed" ||
          input.nextState ===
            "rejected"
        ) &&
        !current.endedAt
      ) {
        timestamps.endedAt =
          occurredAt;
      }

      const [updated] =
        await tx
          .update(calls)
          .set({
            state:
              input.nextState,

            ...timestamps,

            failureReason:
              input.failureReason !==
              undefined
                ? input.failureReason
                : current.failureReason,

            endReason:
              input.endReason !==
              undefined
                ? input.endReason
                : current.endReason,

            updatedAt:
              new Date(),
          })
          .where(
            and(
              eq(
                calls.id,
                input.callId,
              ),

              eq(
                calls.accountId,
                input.accountId,
              ),
            ),
          )
          .returning();

      await tx
        .insert(
          callEvents,
        )
        .values({
          callId:
            current.id,

          eventType:
            input.eventType,

          state:
            input.nextState,

          providerEventId:
            input.providerEventId ??
            null,

          payload:
            input.payload ??
            null,

          occurredAt,
        })
        .onConflictDoNothing();

      return updated;
    },
  );
}

