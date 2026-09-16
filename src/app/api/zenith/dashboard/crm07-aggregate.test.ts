import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db/client";
import { accounts, users, Account, User } from "@/lib/db/schema/identity";
import { contacts, Contact } from "@/lib/db/schema/contacts";
import { companies } from "@/lib/db/schema/companies";
import { deals, pipelines, pipelineStages, type Pipeline, type PipelineStage } from "@/lib/db/schema/pipeline";
import { tasks, activities } from "@/lib/db/schema/activities";
import { conversations } from "@/lib/db/schema/inbox";
import { calls } from "@/lib/db/schema/voice-calls";
import { voiceChannels } from "@/lib/db/schema/voice";
import { eq } from "drizzle-orm";

import { GET as getDashboardMetrics } from "@/app/api/zenith/dashboard/route";

import * as auth from "@/lib/auth/zenith-account";
import { vi } from "vitest";

describe.skipIf(process.env.RUN_DB_TESTS !== "true")("CRM-07 Dashboard Aggregates", () => {
  let accA: Account;
  let userA: User;
  let contactA: Contact;
  let companyA: any;
  let pipeA: Pipeline;
  let stage1: PipelineStage;
  let stage2: PipelineStage;

  beforeAll(async () => {
    // 1. Setup Tenant
    [userA] = await db.insert(users).values({ email: `dash_${Date.now()}@test.com`, passwordHash: "x" }).returning();
    [accA] = await db.insert(accounts).values({ name: "Dashboard Tenant", ownerUserId: userA.id }).returning();

    // 2. Insert Base Entities
    [contactA] = await db.insert(contacts).values({ accountId: accA.id, name: "Dash Contact", phone: "+999111", phoneNormalized: "+999111", userId: userA.id }).returning();
    [companyA] = await db.insert(companies).values({ accountId: accA.id, name: "Dash Company", createdByUserId: userA.id }).returning();

    // 3. Pipeline
    [pipeA] = await db.insert(pipelines).values({ accountId: accA.id, name: "Dash Pipe", userId: userA.id }).returning();
    [stage1] = await db.insert(pipelineStages).values({ pipelineId: pipeA.id, name: "Open Stage", position: 1 }).returning();
    [stage2] = await db.insert(pipelineStages).values({ pipelineId: pipeA.id, name: "Negotiation", position: 2 }).returning();

    const now = new Date();
    const past = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    // 4. Deals (open, won, lost)
    await db.insert(deals).values([
      { accountId: accA.id, pipelineId: pipeA.id, stageId: stage1.id, title: "Deal Open 1", value: "100.50", currency: "USD", status: "open", userId: userA.id },
      { accountId: accA.id, pipelineId: pipeA.id, stageId: stage2.id, title: "Deal Open 2", value: "200.00", currency: "USD", status: "open", userId: userA.id },
      { accountId: accA.id, pipelineId: pipeA.id, stageId: stage2.id, title: "Deal Won", value: "500.00", currency: "USD", status: "won", wonAt: now, userId: userA.id },
      { accountId: accA.id, pipelineId: pipeA.id, stageId: stage1.id, title: "Deal Lost", value: "50.00", currency: "USD", status: "lost", lostAt: now, userId: userA.id },
    ]);

    // 5. Tasks (open, overdue, completed)
    await db.insert(tasks).values([
      { accountId: accA.id, title: "Task Open Future", status: "pending", dueAt: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000), createdByUserId: userA.id },
      { accountId: accA.id, title: "Task Overdue", status: "pending", dueAt: past, createdByUserId: userA.id },
      { accountId: accA.id, title: "Task Due Today", status: "pending", dueAt: now, createdByUserId: userA.id },
      { accountId: accA.id, title: "Task Completed", status: "completed", completedAt: now, createdByUserId: userA.id },
    ]);

    // 6. Inbox (open, pending, unread)
    await db.insert(conversations).values([
      { accountId: accA.id, contactId: contactA.id, userId: userA.id, status: "open", unreadCount: 0 }
    ]);

    const [contactB] = await db.insert(contacts).values({ accountId: accA.id, name: "Dash Contact 2", phone: "+999222", phoneNormalized: "+999222", userId: userA.id }).returning();
    await db.insert(conversations).values({ accountId: accA.id, contactId: contactB.id, userId: userA.id, status: "pending", unreadCount: 2 });

    // 7. Voice Calls (answered, missed)
    const [channel] = await db.insert(voiceChannels).values({ accountId: accA.id, name: "Ch 1", provider: "wacalls", createdByUserId: userA.id }).returning();
    
    await db.insert(calls).values([
      { accountId: accA.id, voiceChannelId: channel.id, provider: "wacalls", direction: "inbound", state: "ended", startedAt: now }, // answered
      { accountId: accA.id, voiceChannelId: channel.id, provider: "wacalls", direction: "inbound", state: "active", startedAt: now }, // answered/active
      { accountId: accA.id, voiceChannelId: channel.id, provider: "wacalls", direction: "inbound", state: "failed" }, // missed
    ]);

    // 8. Activities
    await db.insert(activities).values([
      { accountId: accA.id, type: "deal_created", actorUserId: userA.id, metadata: { dealTitle: "Deal 1" } }
    ]);
  });

  afterAll(async () => {
    // Cleanup everything
    await db.delete(activities).where(eq(activities.accountId, accA.id));
    await db.delete(calls).where(eq(calls.accountId, accA.id));
    await db.delete(voiceChannels).where(eq(voiceChannels.accountId, accA.id));
    await db.delete(conversations).where(eq(conversations.accountId, accA.id));
    await db.delete(tasks).where(eq(tasks.accountId, accA.id));
    await db.delete(deals).where(eq(deals.accountId, accA.id));
    await db.delete(pipelineStages).where(eq(pipelineStages.pipelineId, pipeA.id));
    await db.delete(pipelines).where(eq(pipelines.accountId, accA.id));
    await db.delete(companies).where(eq(companies.accountId, accA.id));
    await db.delete(contacts).where(eq(contacts.accountId, accA.id));
    await db.delete(accounts).where(eq(accounts.id, accA.id));
    await db.delete(users).where(eq(users.id, userA.id));
    await db.delete(accounts).where(eq(accounts.id, accA.id));
  });

  it("Calculates dashboard aggregates exactly", async () => {
    vi.spyOn(auth, "getZenithAccountContext").mockResolvedValue({ accountId: accA.id, userId: userA.id, role: "admin" } as any);
    vi.spyOn(auth, "requireZenithRole").mockResolvedValue({ accountId: accA.id, userId: userA.id, role: "admin" } as any);

    const req = new Request(`http://localhost/api/zenith/dashboard`) as unknown as import("next/server").NextRequest;
    const res = await getDashboardMetrics(req);
    const body = await res.json();
    
    expect(res.status).toBe(200);
    
    // Validate Deal Aggregates
    expect(body.deals.open).toBe(2);
    expect(body.deals.won).toBe(1);
    expect(body.deals.lost).toBe(1);
    expect(body.deals.openValue).toBe(300.50); // 100.50 + 200.00
    expect(body.deals.wonValue).toBe(500.00);
    expect(body.deals.lostValue).toBe(50.00);

    // Validate Pipeline Funnel
    expect(body.funnel.stages).toBeDefined();
    const stage1Slice = body.funnel.stages.find((s: any) => s.id === stage1.id);
    expect(stage1Slice.dealCount).toBe(1);
    expect(stage1Slice.totalValue).toBe(100.50);
    expect(body.funnel.totalValue).toBe(300.50);

    // Validate Tasks
    expect(body.tasks.open).toBe(3); // 1 future, 1 overdue, 1 today
    expect(body.tasks.overdue).toBe(1);
    expect(body.tasks.dueToday).toBe(1);
    expect(body.tasks.completedInPeriod).toBe(1);

    // Validate Inbox
    expect(body.inbox.open).toBe(1);
    expect(body.inbox.pending).toBe(1);
    // Unread is where unreadCount >= 1
    expect(body.inbox.unread).toBe(1);

    // Validate Calls
    expect(body.calls.totalInPeriod).toBe(3);
    expect(body.calls.answered).toBe(2);
    expect(body.calls.missed).toBe(1);

    // Validate Activities
    expect(body.activities).toHaveLength(1);
    expect(body.activities[0].kind).toBe("deal");
  });
});
