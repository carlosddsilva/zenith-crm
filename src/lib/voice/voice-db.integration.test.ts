import {
  randomUUID,
} from "node:crypto";

import {
  and,
  eq,
} from "drizzle-orm";
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  db,
} from "@/lib/db/client";
import {
  accounts,
  callEvents,
  callParticipants,
  calls,
  contacts,
  ivrExecutionSteps,
  ivrExecutions,
  ivrFlowBindings,
  ivrFlows,
  ivrFlowVersions,
  users,
  voiceChannels,
} from "@/lib/db/schema";
import {
  resolveInboundIvrBinding,
} from "@/lib/ivr/binding-resolver";
import {
  createIvrExecution,
  runIvrExecution,
} from "@/lib/ivr/execution-engine";
import type {
  IvrFlowDefinition,
} from "@/lib/ivr/types";
import {
  anonymizeContact,
} from "@/lib/privacy/anonymize";
import {
  reserveOutboundVoiceCall,
} from "./allocation";
import {
  appendCallEvent,
  transitionCallState,
} from "./call-state";
import {
  findOrCreateInboundCall,
} from "./inbound-call";

const ids = {
  ownerA: randomUUID(),
  agentA: randomUUID(),
  agentA2: randomUUID(),
  ownerB: randomUUID(),
  accountA: randomUUID(),
  accountB: randomUUID(),
  channelA: randomUUID(),
  allocationChannelA:
    randomUUID(),
  channelB: randomUUID(),
};

const handoffDefinition: IvrFlowDefinition = {
  nodes: [
    {
      id: "start",
      type: "trigger.inbound",
      position: {
        x: 0,
        y: 0,
      },
      data: {},
    },
    {
      id: "answer",
      type: "call.answer",
      position: {
        x: 100,
        y: 0,
      },
      data: {},
    },
    {
      id: "handoff",
      type: "queue.route",
      position: {
        x: 200,
        y: 0,
      },
      data: {
        queueKey: "support",
        timeoutSeconds: 30,
      },
    },
  ],
  edges: [
    {
      id: "start-answer",
      source: "start",
      target: "answer",
    },
    {
      id: "answer-handoff",
      source: "answer",
      target: "handoff",
    },
  ],
  settings: {
    providers: ["wacalls"],
  },
};

const dbDescribe =
  process.env.RUN_DB_TESTS ===
  "true"
    ? describe.sequential
    : describe.skip;

dbDescribe(
  "ZC-12 PostgreSQL voice invariants",
  () => {
    beforeAll(async () => {
      const url =
        process.env.DATABASE_URL ??
        "";

      if (
        !url.includes(
          "zc12_voice_test",
        )
      ) {
        throw new Error(
          "ZC-12 integration tests require an isolated zc12_voice_test database",
        );
      }

      await db.insert(users).values([
        {
          id: ids.ownerA,
          email:
            `zc12-owner-a-${ids.ownerA}@example.test`,
          name: "Owner A",
        },
        {
          id: ids.agentA,
          email:
            `zc12-agent-a-${ids.agentA}@example.test`,
          name: "Agent A",
        },
        {
          id: ids.agentA2,
          email:
            `zc12-agent-a2-${ids.agentA2}@example.test`,
          name: "Agent A2",
        },
        {
          id: ids.ownerB,
          email:
            `zc12-owner-b-${ids.ownerB}@example.test`,
          name: "Owner B",
        },
      ]);

      await db.insert(accounts).values([
        {
          id: ids.accountA,
          name: "ZC12 Tenant A",
          ownerUserId:
            ids.ownerA,
        },
        {
          id: ids.accountB,
          name: "ZC12 Tenant B",
          ownerUserId:
            ids.ownerB,
        },
      ]);

      await db
        .insert(voiceChannels)
        .values([
          {
            id: ids.channelA,
            accountId:
              ids.accountA,
            createdByUserId:
              ids.ownerA,
            name: "WaCalls A",
            provider: "wacalls",
            config: {
              baseUrl:
                "http://voice-gateway.test",
              sessionId:
                "tenant-a-session",
            },
            healthStatus:
              "online",
            allowOutbound: false,
            maxConcurrentCalls: 8,
          },
          {
            id:
              ids.allocationChannelA,
            accountId:
              ids.accountA,
            createdByUserId:
              ids.ownerA,
            name: "WaCalls A capacity",
            provider: "wacalls",
            config: {
              baseUrl:
                "http://voice-gateway.test",
              sessionId:
                "tenant-a-capacity",
            },
            healthStatus:
              "online",
            priority: 1,
            maxConcurrentCalls: 1,
          },
          {
            id: ids.channelB,
            accountId:
              ids.accountB,
            createdByUserId:
              ids.ownerB,
            name: "WaCalls B",
            provider: "wacalls",
            config: {
              baseUrl:
                "http://voice-gateway.test",
              sessionId:
                "tenant-b-session",
            },
            healthStatus:
              "online",
            maxConcurrentCalls: 8,
          },
        ]);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("deduplicates inbound delivery per channel without crossing tenants", async () => {
      const providerCallId =
        `same-provider-id-${randomUUID()}`;

      const firstA =
        await findOrCreateInboundCall({
          accountId:
            ids.accountA,
          voiceChannelId:
            ids.channelA,
          provider: "wacalls",
          providerCallId,
          fromPhone:
            "551100000001",
        });
      const replayA =
        await findOrCreateInboundCall({
          accountId:
            ids.accountA,
          voiceChannelId:
            ids.channelA,
          provider: "wacalls",
          providerCallId,
          fromPhone:
            "551100000001",
        });
      const firstB =
        await findOrCreateInboundCall({
          accountId:
            ids.accountB,
          voiceChannelId:
            ids.channelB,
          provider: "wacalls",
          providerCallId,
          fromPhone:
            "552200000002",
        });

      expect(firstA.created).toBe(true);
      expect(replayA.created).toBe(false);
      expect(replayA.call.id).toBe(
        firstA.call.id,
      );
      expect(firstB.call.id).not.toBe(
        firstA.call.id,
      );
      expect(firstB.call.accountId).toBe(
        ids.accountB,
      );
    });

    it("uses answered_at only on active and sanitizes duplicate/out-of-order delivery", async () => {
      const [call] =
        await db.insert(calls).values({
          accountId:
            ids.accountA,
          voiceChannelId:
            ids.channelA,
          provider: "wacalls",
          providerCallId:
            `state-${randomUUID()}`,
          direction: "inbound",
          state: "ringing",
          startedAt: new Date(),
          ringingAt: new Date(),
        }).returning();

      await expect(
        transitionCallState({
          accountId:
            ids.accountB,
          callId: call.id,
          nextState: "active",
          eventType:
            "call-status",
        }),
      ).rejects.toThrow(
        "Call not found",
      );

      const answeredAt =
        new Date(
          "2026-09-16T12:00:00.000Z",
        );
      const active =
        await transitionCallState({
          accountId:
            ids.accountA,
          callId: call.id,
          nextState: "active",
          eventType:
            "call-status",
          providerEventId:
            "provider-active-once",
          occurredAt: answeredAt,
        });

      expect(
        active.answeredAt?.toISOString(),
      ).toBe(
        answeredAt.toISOString(),
      );

      await transitionCallState({
        accountId:
          ids.accountA,
        callId: call.id,
        nextState: "active",
        eventType:
          "call-status",
        providerEventId:
          "provider-active-once",
        occurredAt:
          new Date(
            "2026-09-16T12:01:00.000Z",
          ),
      });

      await transitionCallState({
        accountId:
          ids.accountA,
        callId: call.id,
        nextState: "ended",
        eventType:
          "call-ended",
        providerEventId:
          "provider-ended-once",
        occurredAt:
          new Date(
            "2026-09-16T12:02:00.000Z",
          ),
      });

      await expect(
        transitionCallState({
          accountId:
            ids.accountA,
          callId: call.id,
          nextState: "ringing",
          eventType:
            "stale-ringing",
        }),
      ).rejects.toThrow(
        "Invalid call transition",
      );

      const duplicateEvents =
        await db
          .select()
          .from(callEvents)
          .where(
            and(
              eq(
                callEvents.callId,
                call.id,
              ),
              eq(
                callEvents.providerEventId,
                "provider-active-once",
              ),
            ),
          );

      expect(duplicateEvents).toHaveLength(1);
    });

    it("serializes concurrent active/ended transitions so a terminal state cannot regress", async () => {
      const [call] =
        await db.insert(calls).values({
          accountId:
            ids.accountA,
          voiceChannelId:
            ids.channelA,
          provider: "wacalls",
          providerCallId:
            `race-${randomUUID()}`,
          direction: "inbound",
          state: "ringing",
          startedAt: new Date(),
          ringingAt: new Date(),
        }).returning();

      await Promise.allSettled([
        transitionCallState({
          accountId:
            ids.accountA,
          callId: call.id,
          nextState: "active",
          eventType: "race-active",
          providerEventId:
            "race-active",
        }),
        transitionCallState({
          accountId:
            ids.accountA,
          callId: call.id,
          nextState: "ended",
          eventType: "race-ended",
          providerEventId:
            "race-ended",
        }),
      ]);

      const [stored] =
        await db
          .select()
          .from(calls)
          .where(
            and(
              eq(calls.id, call.id),
              eq(
                calls.accountId,
                ids.accountA,
              ),
            ),
          );

      expect(stored.state).toBe(
        "ended",
      );
      expect(stored.endedAt).not.toBeNull();
    });

    it("allocates the last channel slot once under a two-agent race", async () => {
      const attempts =
        await Promise.allSettled([
          reserveOutboundVoiceCall({
            accountId:
              ids.accountA,
            userId:
              ids.agentA,
            provider: "wacalls",
            to: "5511999999901",
          }),
          reserveOutboundVoiceCall({
            accountId:
              ids.accountA,
            userId:
              ids.agentA2,
            provider: "wacalls",
            to: "5511999999902",
          }),
        ]);

      const accepted =
        attempts.filter(
          (result) =>
            result.status ===
            "fulfilled",
        );
      const rejected =
        attempts.filter(
          (result) =>
            result.status ===
            "rejected",
        );

      expect(accepted).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      if (
        accepted[0]?.status ===
        "fulfilled"
      ) {
        expect(
          accepted[0].value.channel.id,
        ).toBe(
          ids.allocationChannelA,
        );
      }
    });

    it("resolves a published flow and hands off without ending the customer call", async () => {
      const [call] =
        await db.insert(calls).values({
          accountId:
            ids.accountA,
          voiceChannelId:
            ids.channelA,
          provider: "wacalls",
          providerCallId:
            `ivr-${randomUUID()}`,
          direction: "inbound",
          state: "new",
          startedAt: new Date(),
          ringingAt: new Date(),
        }).returning();
      const [flow] =
        await db.insert(ivrFlows).values({
          accountId:
            ids.accountA,
          createdByUserId:
            ids.ownerA,
          name:
            `ZC12 handoff ${randomUUID()}`,
          status: "published",
        }).returning();
      const [version] =
        await db
          .insert(ivrFlowVersions)
          .values({
            flowId: flow.id,
            createdByUserId:
              ids.ownerA,
            version: 1,
            status: "published",
            definition:
              handoffDefinition,
            publishedAt: new Date(),
          })
          .returning();
      await db.insert(ivrFlowBindings).values({
        accountId:
          ids.accountA,
        flowId: flow.id,
        voiceChannelId:
          ids.channelA,
        direction: "inbound",
        routingKey: "*",
      });

      const binding =
        await resolveInboundIvrBinding({
          accountId:
            ids.accountA,
          voiceChannelId:
            ids.channelA,
        });
      const otherTenantBinding =
        await resolveInboundIvrBinding({
          accountId:
            ids.accountB,
          voiceChannelId:
            ids.channelA,
        });

      expect(binding).toMatchObject({
        flowId: flow.id,
        flowVersionId:
          version.id,
      });
      expect(otherTenantBinding).toBeNull();

      const execution =
        await createIvrExecution({
          accountId:
            ids.accountA,
          callId: call.id,
          flowId: flow.id,
          flowVersionId:
            version.id,
          voiceChannelId:
            ids.channelA,
          provider: "wacalls",
          context: {
            providerCallId:
              call.providerCallId,
          },
        });

      const fetchMock =
        vi.fn().mockImplementation(
          async () =>
            new Response(
              JSON.stringify({
                status: "ok",
              }),
              {
                status: 200,
                headers: {
                  "Content-Type":
                    "application/json",
                },
              },
            ),
        );
      vi.stubGlobal(
        "fetch",
        fetchMock,
      );

      const result =
        await runIvrExecution({
          executionId:
            execution.id,
          providerCallId:
            call.providerCallId!,
          clientId:
            ids.channelA,
          providerConfig: {
            provider: "wacalls",
            baseUrl:
              "http://voice-gateway.test",
            sessionId:
              "tenant-a-session",
            apiKey: null,
          },
        });

      expect(result.status).toBe(
        "completed",
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);

      const urls =
        fetchMock.mock.calls.map(
          ([url]) => String(url),
        );
      expect(urls[0]).toContain(
        "/accept",
      );
      expect(urls[1]).toContain(
        "/release",
      );
      expect(
        fetchMock.mock.calls.some(
          ([, init]) =>
            (
              init as RequestInit
            )?.method === "DELETE",
        ),
      ).toBe(false);

      const [storedCall] =
        await db
          .select()
          .from(calls)
          .where(
            and(
              eq(calls.id, call.id),
              eq(
                calls.accountId,
                ids.accountA,
              ),
            ),
          );
      const [storedExecution] =
        await db
          .select()
          .from(ivrExecutions)
          .where(
            and(
              eq(
                ivrExecutions.id,
                execution.id,
              ),
              eq(
                ivrExecutions.accountId,
                ids.accountA,
              ),
            ),
          );
      const steps =
        await db
          .select()
          .from(ivrExecutionSteps)
          .where(
            eq(
              ivrExecutionSteps.executionId,
              execution.id,
            ),
          );

      expect(storedCall.state).toBe(
        "ringing",
      );
      expect(
        storedCall.assignedAgentId,
      ).toBeNull();
      expect(storedCall.endedAt).toBeNull();
      expect(storedExecution.status).toBe(
        "completed",
      );
      expect(steps).toHaveLength(3);

      const handoffEvents =
        await db
          .select()
          .from(callEvents)
          .where(
            and(
              eq(
                callEvents.callId,
                call.id,
              ),
              eq(
                callEvents.eventType,
                "call_handoff",
              ),
            ),
          );
      expect(handoffEvents).toHaveLength(1);
    });

    it("records a provider event once when delivery is repeated", async () => {
      const [call] =
        await db.insert(calls).values({
          accountId:
            ids.accountB,
          voiceChannelId:
            ids.channelB,
          provider: "wacalls",
          providerCallId:
            `duplicate-${randomUUID()}`,
          direction: "inbound",
          state: "ringing",
        }).returning();

      const args = {
        accountId: ids.accountB,
        callId: call.id,
        eventType: "incoming",
        providerEventId:
          "stable-provider-event",
      };
      const first =
        await appendCallEvent(args);
      const duplicate =
        await appendCallEvent(args);

      expect(first).not.toBeNull();
      expect(duplicate).toBeNull();
    });

    it("redacts voice PII without abandoning cleanup of an active call", async () => {
      const contactId =
        randomUUID();
      await db.insert(contacts).values({
        id: contactId,
        accountId:
          ids.accountA,
        userId:
          ids.ownerA,
        phone: "+5511999999999",
        phoneNormalized:
          "5511999999999",
        name: "Synthetic Voice Contact",
      });
      const [call] =
        await db.insert(calls).values({
          accountId:
            ids.accountA,
          voiceChannelId:
            ids.channelA,
          provider: "wacalls",
          providerCallId:
            `privacy-${randomUUID()}`,
          direction: "inbound",
          state: "active",
          contactId,
          fromPhone:
            "5511999999999",
          toPhone:
            "5511000000000",
          startedAt: new Date(),
          answeredAt: new Date(),
        }).returning();
      await db.insert(callEvents).values({
        callId: call.id,
        eventType: "call-status",
        state: "active",
        payload: {
          peer: "5511999999999",
        },
      });
      await db.insert(callParticipants).values({
        callId: call.id,
        participantType: "contact",
        contactId,
        phone: "5511999999999",
        displayName:
          "Synthetic Voice Contact",
      });

      await anonymizeContact(
        {
          userId: ids.ownerA,
          email:
            "zc12-owner-a@example.test",
          name: "Owner A",
          accountId:
            ids.accountA,
          role: "owner",
          isSuspended: false,
          systemRole: "user",
          account: {
            id: ids.accountA,
            name: "ZC12 Tenant A",
            defaultCurrency: "BRL",
            planId: null,
          },
        },
        contactId,
      );

      const [storedCall] =
        await db
          .select()
          .from(calls)
          .where(
            and(
              eq(calls.id, call.id),
              eq(
                calls.accountId,
                ids.accountA,
              ),
            ),
          );
      const [storedEvent] =
        await db
          .select()
          .from(callEvents)
          .where(
            eq(
              callEvents.callId,
              call.id,
            ),
          );
      const [storedParticipant] =
        await db
          .select()
          .from(callParticipants)
          .where(
            eq(
              callParticipants.callId,
              call.id,
            ),
          );

      expect(storedCall.state).toBe(
        "active",
      );
      expect(
        storedCall.providerCallId,
      ).toBe(call.providerCallId);
      expect(storedCall.fromPhone).toBeNull();
      expect(storedCall.toPhone).toBeNull();
      expect(storedEvent.payload).toBeNull();
      expect(storedParticipant.phone).toBeNull();
      expect(
        storedParticipant.displayName,
      ).toBe("Anonimo");
    });
  },
);
