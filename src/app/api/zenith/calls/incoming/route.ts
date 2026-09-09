import {
  and,
  desc,
  eq,
  inArray,
  or,
} from "drizzle-orm";

import {
  NextResponse,
} from "next/server";

import {
  requireZenithRole,
} from "@/lib/auth/zenith-account";

import {
  db,
} from "@/lib/db/client";

import {
  calls,
  contacts,
} from "@/lib/db/schema";

export async function GET() {
  try {
    const context =
      await requireZenithRole(
        "agent",
      );

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

          contactName:
            contacts.name,

          contactPhone:
            contacts.phone,

          contactAvatarUrl:
            contacts.avatarUrl,

          fromPhone:
            calls.fromPhone,

          toPhone:
            calls.toPhone,

          startedAt:
            calls.startedAt,

          ringingAt:
            calls.ringingAt,

          answeredAt:
            calls.answeredAt,

          createdAt:
            calls.createdAt,

          updatedAt:
            calls.updatedAt,
        })
        .from(
          calls,
        )
        .leftJoin(
          contacts,
          and(
            eq(
              contacts.id,
              calls.contactId,
            ),

            eq(
              contacts.accountId,
              context.accountId,
            ),
          ),
        )
        .where(
          and(
            eq(
              calls.accountId,
              context.accountId,
            ),

            eq(
              calls.direction,
              "inbound",
            ),

            or(
              /*
               * Enquanto toca, todos os agentes
               * elegiveis podem visualizar.
               */
              eq(
                calls.state,
                "ringing",
              ),

              /*
               * Depois do claim, somente o
               * operador que atendeu continua
               * recebendo a chamada.
               */
              and(
                inArray(
                  calls.state,
                  [
                    "connecting",
                    "active",
                  ],
                ),

                eq(
                  calls.assignedAgentId,
                  context.userId,
                ),
              ),
            ),
          ),
        )
        .orderBy(
          desc(
            calls.ringingAt,
          ),
          desc(
            calls.createdAt,
          ),
        )
        .limit(20);

    return NextResponse.json({
      calls:
        rows.map(
          (call) => ({
            id:
              call.id,

            voice_channel_id:
              call.voiceChannelId,

            provider:
              call.provider,

            provider_call_id:
              call.providerCallId,

            direction:
              call.direction,

            state:
              call.state,

            contact_id:
              call.contactId,

            contact_name:
              call.contactName,

            contact_phone:
              call.contactPhone,

            contact_avatar_url:
              call.contactAvatarUrl,

            from_phone:
              call.fromPhone,

            to_phone:
              call.toPhone,

            started_at:
              call.startedAt,

            ringing_at:
              call.ringingAt,

            answered_at:
              call.answeredAt,

            created_at:
              call.createdAt,

            updated_at:
              call.updatedAt,
          }),
        ),
    });
  } catch (error) {
    if (
      error instanceof Response
    ) {
      return error;
    }

    console.error(
      "[incoming voice calls]",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Falha ao consultar chamadas recebidas.",
      },
      {
        status: 500,
      },
    );
  }
}