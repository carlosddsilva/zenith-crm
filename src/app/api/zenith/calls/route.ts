import {
  and,
  count,
  desc,
  eq,
  ilike,
  or,
} from "drizzle-orm";

import {
  NextResponse,
} from "next/server";

import {
  getZenithAccountContext,
  requireZenithRole,
} from "@/lib/auth/zenith-account";

import {
  db,
} from "@/lib/db/client";

import {
  callEvents,
  calls,
  contacts,
} from "@/lib/db/schema";

import {
  reserveOutboundVoiceCall,
  getVoiceProvider,
  transitionCallState,
  sanitizeCallEndReason,
  sanitizeCallFailureReason,
  VoiceProviderError,
} from "@/lib/voice";

import {
  normalizePhone,
} from "@/lib/whatsapp/phone-utils";

function normalizeOutboundPhone(
  value: string,
): string {
  const phone =
    normalizePhone(value);

  if (
    phone.length === 10 ||
    phone.length === 11
  ) {
    return `55${phone}`;
  }

  return phone;
}
const states = [
  "new",
  "ringing",
  "connecting",
  "active",
  "ended",
  "failed",
  "rejected",
] as const;

type CallState =
  (typeof states)[number];

function isCallState(
  value: string | null,
): value is CallState {
  return Boolean(
    value &&
    states.includes(
      value as CallState,
    ),
  );
}

export async function GET(
  request: Request,
) {
  const context =
    await getZenithAccountContext();

  const url =
    new URL(request.url);

  const state =
    url.searchParams.get(
      "state",
    );

  const page =
    Math.max(
      Number(
        url.searchParams.get(
          "page",
        ) ?? "1",
      ) || 1,
      1,
    );

  const pageSize =
    Math.min(
      Math.max(
        Number(
          url.searchParams.get(
            "pageSize",
          ) ?? "50",
        ) || 50,
        1,
      ),
      200,
    );

  const conditions = [
    eq(
      calls.accountId,
      context.accountId,
    ),
  ];

  if (
    state &&
    isCallState(state)
  ) {
    conditions.push(
      eq(
        calls.state,
        state,
      ),
    );
  }

  const direction =
    url.searchParams.get(
      "direction",
    );

  if (
    direction === "inbound" ||
    direction === "outbound"
  ) {
    conditions.push(
      eq(
        calls.direction,
        direction,
      ),
    );
  }

  const search =
    url.searchParams.get(
      "search",
    );

  if (search) {
    const cleanSearch =
      search.replace(
        /\D/g,
        "",
      );
    const term = `%${cleanSearch || search}%`;

    conditions.push(
      or(
        ilike(
          calls.fromPhone,
          term,
        ),
        ilike(
          calls.toPhone,
          term,
        ),
      )!,
    );
  }

  const where =
    and(...conditions);

  const [totalRow] =
    await db
      .select({
        total:
          count(),
      })
      .from(calls)
      .where(where);

  const rows =
    await db
      .select({
        id:
          calls.id,

        voiceChannelId:
          calls.voiceChannelId,

        provider:
          calls.provider,

        providerCallId:
          calls.providerCallId,

        direction:
          calls.direction,

        state:
          calls.state,

        contactId:
          calls.contactId,

        assignedAgentId:
          calls.assignedAgentId,

        fromPhone:
          calls.fromPhone,

        toPhone:
          calls.toPhone,

        failureReason:
          calls.failureReason,

        endReason:
          calls.endReason,

        startedAt:
          calls.startedAt,

        ringingAt:
          calls.ringingAt,

        answeredAt:
          calls.answeredAt,

        endedAt:
          calls.endedAt,

        createdAt:
          calls.createdAt,

        updatedAt:
          calls.updatedAt,

        contactName:
          contacts.name,

        contactPhone:
          contacts.phone,
      })
      .from(calls)
      .leftJoin(
        contacts,
        eq(
          contacts.id,
          calls.contactId,
        ),
      )
      .where(where)
      .orderBy(
        desc(
          calls.createdAt,
        ),
      )
      .limit(pageSize)
      .offset(
        (page - 1) *
          pageSize,
      );

  return NextResponse.json({
    items:
      rows.map(
        (row) => ({
          id:
            row.id,

          voice_channel_id:
            row.voiceChannelId,

          provider:
            row.provider,

          provider_call_id:
            row.providerCallId,

          direction:
            row.direction,

          state:
            row.state,

          contact_id:
            row.contactId,

          assigned_agent_id:
            row.assignedAgentId,

          from_phone:
            row.fromPhone,

          to_phone:
            row.toPhone,

          failure_reason:
            sanitizeCallFailureReason(row.failureReason),

          end_reason:
            sanitizeCallEndReason(row.endReason),

          started_at:
            row.startedAt,

          ringing_at:
            row.ringingAt,

          answered_at:
            row.answeredAt,

          ended_at:
            row.endedAt,

          created_at:
            row.createdAt,

          updated_at:
            row.updatedAt,

          contact:
            row.contactId
              ? {
                  id:
                    row.contactId,

                  name:
                    row.contactName,

                  phone:
                    row.contactPhone,
                }
              : null,
        }),
      ),

    pagination: {
      page,
      pageSize,

      total:
        Number(
          totalRow?.total ??
          0,
        ),
    },
  });
}

export async function POST(
  request: Request,
) {
  const context =
    await requireZenithRole(
      "agent",
    );

  const body =
    (await request.json()) as {
      to?:
        string;

      from?:
        string | null;

      contact_id?:
        string | null;
    
      client_id?:
        string;
    };

  const providerClientId =
    typeof body.client_id === "string" &&
    body.client_id.trim()
      ? body.client_id.trim()
      : context.userId;

  if (
    providerClientId.length >
    256
  ) {
    return NextResponse.json(
      {
        error:
          "client_id invalido.",
      },
      {
        status:
          400,
      },
    );
  }
  let contactId =
    body.contact_id ??
    null;

  let to =
    body.to
      ? normalizeOutboundPhone(
          body.to,
        )
      : "";

  if (contactId) {
    const [contact] =
      await db
        .select({
          id:
            contacts.id,

          phone:
            contacts.phone,

          phoneNormalized:
            contacts.phoneNormalized,
        })
        .from(contacts)
        .where(
          and(
            eq(
              contacts.id,
              contactId,
            ),

            eq(
              contacts.accountId,
              context.accountId,
            ),
          ),
        )
        .limit(1);

    if (!contact) {
      return NextResponse.json(
        {
          error:
            "Contato nao encontrado.",
        },
        {
          status: 404,
        },
      );
    }

    if (!to) {
      to =
        normalizeOutboundPhone(
          contact.phoneNormalized ||
            contact.phone,
        );
    }
  }

  if (
    !to ||
    to.length < 7 ||
    to.length > 15
  ) {
    return NextResponse.json(
      {
        error:
          "Numero de destino invalido.",
      },
      {
        status: 400,
      },
    );
  }

  let reservation:
    Awaited<
      ReturnType<
        typeof reserveOutboundVoiceCall
      >
    >;

  try {
    reservation =
      await reserveOutboundVoiceCall({
        accountId:
          context.accountId,

        userId:
          context.userId,

        contactId,

        provider:
          "wacalls",

        to,

        from:
          body.from
            ? normalizePhone(
                body.from,
              )
            : null,
      });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao reservar canal de voz.";
    console.error("[voice call route] Reservation error:", error);

    return NextResponse.json(
      {
        error: "Falha ao iniciar chamada.",
      },
      {
        status:
          error instanceof
          VoiceProviderError
            ? error.status
            : 500,
      },
    );
  }

  const created =
    reservation.call;

  const channel =
    reservation.channel;

  const provider =
    getVoiceProvider(
      channel.provider,
    );
  try {
    if (!provider.startCall) {
      throw new VoiceProviderError(
        "voice_provider_server_start_unsupported",
        "Este provedor de voz nao suporta originacao server-side.",
        409,
      );
    }

    const result =
      await provider.startCall(
        {
            to,

            clientId:
              providerClientId,
          },

        channel.config,
      );

    await db
      .update(calls)
      .set({
        providerCallId:
          result.providerCallId,

        updatedAt:
          new Date(),
      })
      .where(
        and(
          eq(
            calls.id,
            created.id,
          ),

          eq(
            calls.accountId,
            context.accountId,
          ),
        ),
      );

    const updated =
      await transitionCallState({
        accountId:
          context.accountId,

        callId:
          created.id,

        nextState:
          result.state,

        eventType:
          "provider.call.started",

        payload: {
          provider:
            channel.provider,

          providerCallId:
            result.providerCallId,
        },
      });

    return NextResponse.json(
      {
        item: {
          id:
            updated.id,

          provider:
            updated.provider,

          provider_call_id:
            updated.providerCallId,

          direction:
            updated.direction,

          state:
            updated.state,

          to_phone:
            updated.toPhone,

          started_at:
            updated.startedAt,
        },
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao iniciar chamada.";
    console.error("[voice call route] Dial error:", error);

    await transitionCallState({
      accountId:
        context.accountId,

      callId:
        created.id,

      nextState:
        "failed",

      eventType:
        "provider.call.failed",

      failureReason:
        message,

      payload: {
        provider:
          channel.provider,
      },
    });

    return NextResponse.json(
      {
        error: "Falha ao iniciar chamada.",

        item: {
          id:
            created.id,

          provider:
            created.provider,

          direction:
            created.direction,

          state:
            "failed",

          to_phone:
            created.toPhone,
        },
      },
      {
        status:
          error instanceof
          VoiceProviderError
            ? error.status
            : 502,
      },
    );
  }
}






