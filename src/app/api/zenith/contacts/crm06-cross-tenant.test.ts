import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db/client";
import { accounts, users, Account, User } from "@/lib/db/schema/identity";
import { contacts, Contact } from "@/lib/db/schema/contacts";
import { companies } from "@/lib/db/schema/companies";
import { deals, Deal } from "@/lib/db/schema/pipeline";
import { tasks } from "@/lib/db/schema/activities";
import { conversations } from "@/lib/db/schema/inbox";
import { calls } from "@/lib/db/schema/voice-calls";
import { eq } from "drizzle-orm";

import { GET as getContact } from "@/app/api/zenith/contacts/[id]/route";
import { GET as getDeals } from "@/app/api/zenith/deals/route";
import { GET as getTasks } from "@/app/api/zenith/tasks/route";
import { GET as getConversations } from "@/app/api/zenith/conversations/route";
import { GET as getCalls } from "@/app/api/zenith/calls/route";

import * as auth from "@/lib/auth/zenith-account";
import { vi } from "vitest";

describe("CRM-06 Cross-Tenant Security", () => {
  let accA: Account;
  let accB: Account;
  let userA: User;
  let userB: User;
  let contactA: Contact;
  let contactB: Contact;
  let companyA: any;
  let dealA: Deal;
  let taskA: any;

  beforeAll(async () => {
    [userA] = await db.insert(users).values({ email: "a123@test.com", passwordHash: "x" }).returning();
    [accA] = await db.insert(accounts).values({ name: "Tenant A", ownerUserId: userA.id }).returning();

    [userB] = await db.insert(users).values({ email: "b123@test.com", passwordHash: "y" }).returning();
    [accB] = await db.insert(accounts).values({ name: "Tenant B", ownerUserId: userB.id }).returning();

    [contactA] = await db.insert(contacts).values({ accountId: accA.id, name: "Contact A", phone: "+111222", userId: userA.id, phoneNormalized: "+111222" }).returning();
    [contactB] = await db.insert(contacts).values({ accountId: accB.id, name: "Contact B", phone: "+222333", userId: userB.id, phoneNormalized: "+222333" }).returning();

    [companyA] = await db.insert(companies).values({ accountId: accA.id, name: "Company A", createdByUserId: userA.id }).returning();

    const { pipelines, pipelineStages } = await import("@/lib/db/schema/pipeline");
    const [pipe] = await db.insert(pipelines).values({ accountId: accA.id, userId: userA.id, name: "Pipe A" }).returning();
    const [stage] = await db.insert(pipelineStages).values({ pipelineId: pipe.id, name: "Stage A", position: 1 }).returning();

    [dealA] = await db.insert(deals).values({ accountId: accA.id, pipelineId: pipe.id, stageId: stage.id, title: "Deal A", contactId: contactA.id, userId: userA.id, currency: "USD" }).returning();
    [taskA] = await db.insert(tasks).values({ accountId: accA.id, title: "Task A", contactId: contactA.id, createdByUserId: userA.id }).returning();
  });

  afterAll(async () => {
    await db.delete(tasks).where(eq(tasks.accountId, accA.id));
    await db.delete(deals).where(eq(deals.accountId, accA.id));
    await db.delete(companies).where(eq(companies.accountId, accA.id));
    await db.delete(contacts).where(eq(contacts.accountId, accA.id));
    await db.delete(contacts).where(eq(contacts.accountId, accB.id));
    await db.delete(users).where(eq(users.id, userA.id));
    await db.delete(users).where(eq(users.id, userB.id));
    await db.delete(accounts).where(eq(accounts.id, accA.id));
    await db.delete(accounts).where(eq(accounts.id, accB.id));
    
    const { pipelines, pipelineStages } = await import("@/lib/db/schema/pipeline");
    await db.delete(pipelines).where(eq(pipelines.accountId, accA.id));
  });

  it("A) Contact account A -> contexto account B -> GET -> 404/resultado controlado", async () => {
    vi.spyOn(auth, "requireZenithRole").mockResolvedValue({ accountId: accB.id, userId: userB.id, role: "agent" } as any);
    vi.spyOn(auth, "getZenithAccountContext").mockResolvedValue({ accountId: accB.id, userId: userB.id } as any);
    
    const req = new Request(`http://localhost/api/zenith/contacts/${contactA.id}`);
    const res = await getContact(req, { params: Promise.resolve({ id: contactA.id }) });
    expect(res.status).toBe(404);
  });

  it("E) filtro de deals por foreign contactId -> não vaza dados", async () => {
    vi.spyOn(auth, "requireZenithRole").mockResolvedValue({ accountId: accB.id, userId: userB.id, role: "agent" } as any);
    
    const req = new Request(`http://localhost/api/zenith/deals?contactId=${contactA.id}`);
    const res = await getDeals(req);
    const body = await res.json();
    
    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("E) filtro de tasks por foreign contactId -> não vaza dados", async () => {
    vi.spyOn(auth, "requireZenithRole").mockResolvedValue({ accountId: accB.id, userId: userB.id, role: "agent" } as any);
    
    const req = new Request(`http://localhost/api/zenith/tasks?contactId=${contactA.id}`);
    const res = await getTasks(req);
    const body = await res.json();
    
    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("E) filtro de conversations/calls por foreign contactId -> não vaza dados", async () => {
    vi.spyOn(auth, "requireZenithRole").mockResolvedValue({ accountId: accB.id, userId: userB.id, role: "agent" } as any);
    vi.spyOn(auth, "getZenithAccountContext").mockResolvedValue({ accountId: accB.id, userId: userB.id } as any);

    let req = new Request(`http://localhost/api/zenith/conversations?contactId=${contactA.id}`);
    let res = await getConversations(req);
    let body = await res.json();
    expect(body.items || body).toEqual([]);

    req = new Request(`http://localhost/api/zenith/calls?contactId=${contactA.id}`);
    const resCalls = await getCalls(req);
    body = await resCalls.json();
    expect(body.items || body).toEqual([]);
  });

});
