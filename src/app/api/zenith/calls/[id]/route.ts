import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getZenithAccountContext } from "@/lib/auth/zenith-account";
import { apiErrorResponse } from "@/lib/api/error-response";
import { db } from "@/lib/db/client";
import { callEvents, calls, contacts, voiceChannels } from "@/lib/db/schema";
import { sanitizeCallEndReason, sanitizeCallFailureReason } from "@/lib/voice";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const context = await getZenithAccountContext();

    const [callRecord] = await db
      .select({
        id: calls.id,
        voiceChannelId: calls.voiceChannelId,
        provider: calls.provider,
        providerCallId: calls.providerCallId,
        direction: calls.direction,
        state: calls.state,
        contactId: calls.contactId,
        assignedAgentId: calls.assignedAgentId,
        fromPhone: calls.fromPhone,
        toPhone: calls.toPhone,
        failureReason: calls.failureReason,
        endReason: calls.endReason,
        startedAt: calls.startedAt,
        ringingAt: calls.ringingAt,
        answeredAt: calls.answeredAt,
        endedAt: calls.endedAt,
        createdAt: calls.createdAt,
        updatedAt: calls.updatedAt,

        contactName: contacts.name,
        contactPhone: contacts.phone,

        channelName: voiceChannels.name,
        channelProvider: voiceChannels.provider,
      })
      .from(calls)
      .leftJoin(
        contacts,
        and(eq(contacts.id, calls.contactId), eq(contacts.accountId, context.accountId))
      )
      .leftJoin(
        voiceChannels,
        and(eq(voiceChannels.id, calls.voiceChannelId), eq(voiceChannels.accountId, context.accountId))
      )
      .where(and(eq(calls.id, id), eq(calls.accountId, context.accountId)))
      .limit(1);

    if (!callRecord) {
      return NextResponse.json({ error: "Chamada não encontrada" }, { status: 404 });
    }

    const events = await db
      .select({
        id: callEvents.id,
        eventType: callEvents.eventType,
        state: callEvents.state,
        occurredAt: callEvents.occurredAt,
      })
      .from(callEvents)
      .where(eq(callEvents.callId, callRecord.id))
      .orderBy(asc(callEvents.occurredAt), asc(callEvents.createdAt), asc(callEvents.id));

    const callResponse = {
      id: callRecord.id,
      provider: callRecord.provider,
      provider_call_id: callRecord.providerCallId,
      direction: callRecord.direction,
      state: callRecord.state,
      from_phone: callRecord.fromPhone,
      to_phone: callRecord.toPhone,
      failure_reason: sanitizeCallFailureReason(callRecord.failureReason),
      end_reason: sanitizeCallEndReason(callRecord.endReason),
      started_at: callRecord.startedAt,
      answered_at: callRecord.answeredAt,
      ended_at: callRecord.endedAt,
      contact: callRecord.contactId
        ? {
            name: callRecord.contactName,
          }
        : null,
      voice_channel: {
        name: callRecord.channelName,
        provider: callRecord.channelProvider,
      },
    };

    return NextResponse.json({
      call: callResponse,
      events: events.map(e => ({
        id: e.id,
        event_type: e.eventType,
        state: e.state,
        occurred_at: e.occurredAt,
      })),
    });
  } catch (error) {
    return apiErrorResponse(error, "[GET /api/zenith/calls/[id]]");
  }
}
