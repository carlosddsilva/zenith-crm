import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { db } from "@/lib/db/client";
import { accounts, users, type Account, type User } from "@/lib/db/schema/identity";
import { contacts, type Contact } from "@/lib/db/schema/contacts";
import { companies } from "@/lib/db/schema/companies";
import { deals, pipelines, pipelineStages, type Deal } from "@/lib/db/schema/pipeline";
import { tasks } from "@/lib/db/schema/activities";
import { conversations } from "@/lib/db/schema/inbox";
import { calls } from "@/lib/db/schema/voice-calls";
import { voiceChannels } from "@/lib/db/schema/voice";
import { broadcasts } from "@/lib/db/schema/broadcasts";
import { automations } from "@/lib/db/schema/automations";
import { eq } from "drizzle-orm";

import { GET as getContact } from "@/app/api/zenith/contacts/[id]/route";
import { GET as getDeals } from "@/app/api/zenith/deals/route";
import { POST as createDeal } from "@/app/api/zenith/deals/route";
import { PATCH as patchDeal } from "@/app/api/zenith/deals/[id]/route";
import { GET as getTasks } from "@/app/api/zenith/tasks/route";
import { PATCH as patchTask } from "@/app/api/zenith/tasks/[id]/route";
import { GET as getConversations } from "@/app/api/zenith/conversations/route";
import { GET as getConversation } from "@/app/api/zenith/conversations/[id]/route";
import { GET as getCalls } from "@/app/api/zenith/calls/route";
import { GET as getCall } from "@/app/api/zenith/calls/[id]/route";
import { GET as getCompany } from "@/app/api/zenith/companies/[id]/route";
import { GET as getBroadcast } from "@/app/api/zenith/broadcasts/[id]/route";
import { GET as getAutomation } from "@/app/api/zenith/automations/[id]/route";
import { PUT as replaceStages } from "@/app/api/zenith/pipelines/[id]/stages/route";

import * as auth from "@/lib/auth/zenith-account";
import { vi } from "vitest";

describe.skipIf(process.env.RUN_DB_TESTS !== "true")("CRM-06 Cross-Tenant Security", () => {
  let accA: Account;
  let accB: Account;
  let userA: User;
  let userB: User;
  let contactA: Contact;
  let companyA: { id: string };
  let dealA: Deal;
  let taskA: { id: string };
  let conversationA: { id: string };
  let callA: { id: string };
  let broadcastA: { id: string };
  let automationA: { id: string };
  let voiceChannelA: { id: string };
  let pipelineA: { id: string };
  let pipelineB: { id: string };
  let stageA: { id: string };

  beforeAll(async () => {
    const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    [userA] = await db.insert(users).values({ email: `crm10-a-${runId}@test.com`, passwordHash: "x" }).returning();
    [accA] = await db.insert(accounts).values({ name: "Tenant A", ownerUserId: userA.id }).returning();

    [userB] = await db.insert(users).values({ email: `crm10-b-${runId}@test.com`, passwordHash: "y" }).returning();
    [accB] = await db.insert(accounts).values({ name: "Tenant B", ownerUserId: userB.id }).returning();

    [contactA] = await db.insert(contacts).values({ accountId: accA.id, name: "Contact A", phone: "+111222", userId: userA.id, phoneNormalized: "+111222" }).returning();
    await db.insert(contacts).values({ accountId: accB.id, name: "Contact B", phone: "+222333", userId: userB.id, phoneNormalized: "+222333" });

    [companyA] = await db.insert(companies).values({ accountId: accA.id, name: "Company A", createdByUserId: userA.id }).returning();

    [pipelineA] = await db.insert(pipelines).values({ accountId: accA.id, userId: userA.id, name: "Pipe A" }).returning();
    [stageA] = await db.insert(pipelineStages).values({ pipelineId: pipelineA.id, name: "Stage A", position: 1 }).returning();
    [pipelineB] = await db.insert(pipelines).values({ accountId: accB.id, userId: userB.id, name: "Pipe B" }).returning();

    [dealA] = await db.insert(deals).values({ accountId: accA.id, pipelineId: pipelineA.id, stageId: stageA.id, title: "Deal A", contactId: contactA.id, userId: userA.id, currency: "USD" }).returning();
    [taskA] = await db.insert(tasks).values({ accountId: accA.id, title: "Task A", contactId: contactA.id, createdByUserId: userA.id }).returning();
    [conversationA] = await db.insert(conversations).values({ accountId: accA.id, contactId: contactA.id, userId: userA.id }).returning();
    [voiceChannelA] = await db.insert(voiceChannels).values({ accountId: accA.id, name: "Voice A", provider: "wacalls", createdByUserId: userA.id }).returning();
    [callA] = await db.insert(calls).values({ accountId: accA.id, voiceChannelId: voiceChannelA.id, provider: "wacalls", direction: "inbound" }).returning();
    [broadcastA] = await db.insert(broadcasts).values({ accountId: accA.id, name: "Broadcast A", createdByUserId: userA.id }).returning();
    [automationA] = await db.insert(automations).values({ accountId: accA.id, name: "Automation A", triggerType: "contact.created", createdByUserId: userA.id }).returning();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await db.delete(automations).where(eq(automations.accountId, accA.id));
    await db.delete(broadcasts).where(eq(broadcasts.accountId, accA.id));
    await db.delete(calls).where(eq(calls.accountId, accA.id));
    await db.delete(voiceChannels).where(eq(voiceChannels.accountId, accA.id));
    await db.delete(conversations).where(eq(conversations.accountId, accA.id));
    await db.delete(tasks).where(eq(tasks.accountId, accA.id));
    await db.delete(deals).where(eq(deals.accountId, accA.id));
    await db.delete(pipelineStages).where(eq(pipelineStages.pipelineId, dealA.pipelineId));
    await db.delete(pipelines).where(eq(pipelines.accountId, accA.id));
    await db.delete(pipelines).where(eq(pipelines.accountId, accB.id));
    await db.delete(companies).where(eq(companies.accountId, accA.id));
    await db.delete(contacts).where(eq(contacts.accountId, accA.id));
    await db.delete(contacts).where(eq(contacts.accountId, accB.id));
    await db.delete(accounts).where(eq(accounts.id, accA.id));
    await db.delete(accounts).where(eq(accounts.id, accB.id));
    await db.delete(users).where(eq(users.id, userA.id));
    await db.delete(users).where(eq(users.id, userB.id));
  });

  function mockTenantB() {
    const context = {
      accountId: accB.id,
      userId: userB.id,
      role: "agent" as const,
      email: userB.email,
      name: userB.name,
      isSuspended: false,
      systemRole: "user" as const,
      account: { id: accB.id, name: accB.name, defaultCurrency: "BRL", planId: null },
    };
    vi.spyOn(auth, "requireZenithRole").mockResolvedValue(context);
    vi.spyOn(auth, "getZenithAccountContext").mockResolvedValue(context);
  }

  async function expectHidden(response: Promise<Response>) {
    const result = await response;
    expect(result.status).toBe(404);
  }

  it("A) Contact account A -> contexto account B -> GET -> 404/resultado controlado", async () => {
    mockTenantB();
    
    const req = new Request(`http://localhost/api/zenith/contacts/${contactA.id}`);
    const res = await getContact(req, { params: Promise.resolve({ id: contactA.id }) });
    expect(res.status).toBe(404);
  });

  it("oculta foreign UUIDs nos oito domínios críticos", async () => {
    mockTenantB();

    const jsonPatch = (url: string, body: object) =>
      new Request(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    const checks: Array<[string, () => Promise<Response>]> = [
      ["Contact", () => getContact(new Request(`http://localhost/api/zenith/contacts/${contactA.id}`), { params: Promise.resolve({ id: contactA.id }) })],
      ["Company", () => getCompany(new Request(`http://localhost/api/zenith/companies/${companyA.id}`), { params: Promise.resolve({ id: companyA.id }) })],
      ["Deal", () => patchDeal(jsonPatch(`http://localhost/api/zenith/deals/${dealA.id}`, { title: "Blocked" }), { params: Promise.resolve({ id: dealA.id }) })],
      ["Task", () => patchTask(jsonPatch(`http://localhost/api/zenith/tasks/${taskA.id}`, { title: "Blocked" }), { params: Promise.resolve({ id: taskA.id }) })],
      ["Conversation", () => getConversation(new Request(`http://localhost/api/zenith/conversations/${conversationA.id}`), { params: Promise.resolve({ id: conversationA.id }) })],
      ["Call", () => getCall(new Request(`http://localhost/api/zenith/calls/${callA.id}`), { params: Promise.resolve({ id: callA.id }) })],
      ["Broadcast", () => getBroadcast(new Request(`http://localhost/api/zenith/broadcasts/${broadcastA.id}`) as never, { params: Promise.resolve({ id: broadcastA.id }) })],
      ["Automation", () => getAutomation(new Request(`http://localhost/api/zenith/automations/${automationA.id}`), { params: Promise.resolve({ id: automationA.id }) })],
    ];

    for (const [domain, run] of checks) {
      await expectHidden(run());
      expect(domain).toBeTruthy();
    }
  });

  it("E) filtro de deals por foreign contactId -> não vaza dados", async () => {
    mockTenantB();
    
    const req = new Request(`http://localhost/api/zenith/deals?contactId=${contactA.id}`);
    const res = await getDeals(req);
    const body = await res.json();
    
    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("E) filtro de tasks por foreign contactId -> não vaza dados", async () => {
    mockTenantB();
    
    const req = new Request(`http://localhost/api/zenith/tasks?contactId=${contactA.id}`);
    const res = await getTasks(req);
    const body = await res.json();
    
    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("E) filtro de conversations/calls por foreign contactId -> não vaza dados", async () => {
    mockTenantB();

    let req = new Request(`http://localhost/api/zenith/conversations?contactId=${contactA.id}`);
    const res = await getConversations(req);
    let body = await res.json();
    expect(body.items || body).toEqual([]);

    req = new Request(`http://localhost/api/zenith/calls?contactId=${contactA.id}`);
    const resCalls = await getCalls(req);
    body = await resCalls.json();
    expect(body.items || body).toEqual([]);
  });

  it("rejeita relacionamentos e IDs de stage pertencentes a outro tenant", async () => {
    mockTenantB();

    const dealResponse = await createDeal(
      new Request("http://localhost/api/zenith/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Cross-tenant deal",
          pipeline_id: pipelineA.id,
          stage_id: stageA.id,
          contact_id: contactA.id,
        }),
      }),
    );
    expect(dealResponse.status).toBe(400);

    const stagesResponse = await replaceStages(
      new Request(`http://localhost/api/zenith/pipelines/${pipelineB.id}/stages`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stages: [{ id: stageA.id, name: "Hijacked", color: "#000000", position: 0 }],
        }),
      }),
      { params: Promise.resolve({ id: pipelineB.id }) },
    );
    expect(stagesResponse.status).toBe(404);

    const [unchanged] = await db
      .select({ name: pipelineStages.name })
      .from(pipelineStages)
      .where(eq(pipelineStages.id, stageA.id));
    expect(unchanged.name).toBe("Stage A");
  });

});
