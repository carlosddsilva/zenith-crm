import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import {
  closeSeedConnection,
  E2E_PASSWORD,
  E2E_USERS,
  seedE2e,
} from "../support/seed.mjs";

type JsonObject = Record<string, unknown>;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for E2E");
const providerBaseUrl =
  process.env.E2E_PROVIDER_BASE_URL ?? "http://127.0.0.1:3199";
const appBaseUrl = process.env.ZENITH_APP_URL ?? "http://127.0.0.1:3100";
const sql = postgres(databaseUrl, { max: 2, prepare: false });
const progressPath = "test-results/e2e-progress.log";
const sessionCookies = new WeakMap<Page, string>();

function rememberSessionCookie(page: Page, setCookie: string | undefined) {
  const cookie = setCookie?.split(";", 1)[0];
  if (!cookie) throw new Error("Login response did not set a session cookie");
  sessionCookies.set(page, cookie);
}

function markProgress(step: string) {
  mkdirSync("test-results", { recursive: true });
  appendFileSync(progressPath, `${new Date().toISOString()} ${step}\n`);
}

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected object, received ${JSON.stringify(value)}`);
  }
  return value as JsonObject;
}

async function request(
  page: Page,
  method: string,
  path: string,
  data?: unknown,
) {
  const headers: Record<string, string> = {
    cookie: sessionCookies.get(page) ?? "",
  };
  if (data !== undefined) headers["content-type"] = "application/json";
  if (path.includes("/api/webhooks/zenith/test-inbound/")) {
    headers["x-zenith-webhook-token"] = "zenith-e2e-webhook-only";
  }
  markProgress(`request:${method}:${path}:start`);
  const response = await fetch(new URL(path, appBaseUrl), {
    method,
    headers,
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(30_000),
  });
  markProgress(`request:${method}:${path}:headers:${response.status}`);
  const text = await response.text();
  markProgress(`request:${method}:${path}:body`);
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }
  return {
    status: response.status,
    body,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

async function expectStatus(
  page: Page,
  method: string,
  path: string,
  status: number,
  data?: unknown,
) {
  const result = await request(page, method, path, data);
  expect(result.status, `${method} ${path}: ${JSON.stringify(result.body)}`).toBe(status);
  return result.body;
}

async function login(page: Page, email: string) {
  markProgress(`login:${email}:start`);
  const loginResponse = await page.request.post("/api/auth/zenith/login", {
    data: { email, password: E2E_PASSWORD },
    timeout: 30_000,
    headers: {
      "x-forwarded-for": `198.51.100.${Object.values(E2E_USERS).indexOf(email) + 10}`,
    },
    failOnStatusCode: false,
  });
  expect(loginResponse.status(), await loginResponse.text()).toBe(200);
  rememberSessionCookie(page, loginResponse.headers()["set-cookie"]);
  markProgress(`login:${email}:api-ok`);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  markProgress(`login:${email}:ui-ok`);
}

async function createTenantResources(page: Page, suffix: string) {
  markProgress(`tenant:${suffix}:resources:start`);
  const pipeline = object(
    await expectStatus(page, "POST", "/api/zenith/pipelines", 200, {
      name: `Pipeline ${suffix}`,
    }),
  );
  markProgress(`tenant:${suffix}:pipeline-ok`);
  const pipelineId = String(pipeline.id);
  const stageOne = randomUUID();
  const stageTwo = randomUUID();
  await expectStatus(
    page,
    "PUT",
    `/api/zenith/pipelines/${pipelineId}/stages`,
    200,
    {
      stages: [
        { id: stageOne, name: "Entrada", color: "#3b82f6", position: 0 },
        { id: stageTwo, name: "Qualificado", color: "#22c55e", position: 1 },
      ],
    },
  );

  const channelResponse = object(
    await expectStatus(page, "POST", "/api/zenith/messaging-channels", 201, {
      name: `Evolution E2E ${suffix}`,
      provider: "evolution",
      is_active: true,
      is_default_service: true,
      config: {
        base_url: providerBaseUrl,
        instance_name: `tenant-${suffix}`,
      },
      credentials: { api_key: "e2e-only" },
    }),
  );
  const channelId = String(object(channelResponse.item).id);
  markProgress(`tenant:${suffix}:channel-ok`);

  const automation = object(
    await expectStatus(page, "POST", "/api/zenith/automations", 201, {
      name: `Contato criado ${suffix}`,
      status: "active",
      triggerType: "contact.created",
      triggerConfig: {},
      conditions: [],
      actions: [
        {
          type: "note.create",
          params: { content: `Nota automática ${suffix}` },
        },
      ],
    }),
  );
  const automationId = String(automation.id);
  await expectStatus(
    page,
    "POST",
    `/api/zenith/automations/${automationId}/publish`,
    200,
  );
  markProgress(`tenant:${suffix}:automation-ok`);

  const followup = object(
    await expectStatus(page, "POST", "/api/zenith/followups", 200, {
      name: `Follow-up ${suffix}`,
      triggerType: "contact.created",
      status: "draft",
      cancelOnReply: true,
      cancelOnDealClosed: true,
      timeZone: "UTC",
      conditions: [],
      steps: [
        {
          delayMinutes: 60,
          action: {
            type: "note.create",
            params: { content: `Follow-up ${suffix}` },
          },
        },
      ],
    }),
  );
  const followupId = String(followup.id);
  await expectStatus(
    page,
    "POST",
    `/api/zenith/followups/${followupId}/publish`,
    200,
  );
  markProgress(`tenant:${suffix}:followup-ok`);

  const phone = suffix === "A" ? "+5565999000101" : "+5565999000202";
  const contactResponse = object(
    await expectStatus(page, "POST", "/api/zenith/contacts", 201, {
      name: `Contato E2E ${suffix}`,
      phone,
      email: `contact-${suffix.toLowerCase()}@zenith-e2e.invalid`,
    }),
  );
  const contact = object(contactResponse.item);
  const contactId = String(contact.id);
  markProgress(`tenant:${suffix}:contact-ok`);

  const deal = object(
    await expectStatus(page, "POST", "/api/zenith/deals", 200, {
      title: `Negócio E2E ${suffix}`,
      pipeline_id: pipelineId,
      stage_id: stageOne,
      contact_id: contactId,
      value: 1250,
      currency: "BRL",
    }),
  );
  const dealId = String(deal.id);
  markProgress(`tenant:${suffix}:deal-ok`);

  const task = object(
    await expectStatus(page, "POST", "/api/zenith/tasks", 200, {
      title: `Tarefa E2E ${suffix}`,
      priority: "high",
      contactId,
      dealId,
    }),
  );

  const note = object(
    await expectStatus(page, "POST", "/api/zenith/notes", 200, {
      content: `Atividade manual ${suffix}`,
      contactId,
      dealId,
    }),
  );
  markProgress(`tenant:${suffix}:task-note-ok`);

  await expectStatus(page, "PATCH", `/api/zenith/deals/${dealId}`, 200, {
    stage_id: stageTwo,
  });
  markProgress(`tenant:${suffix}:stage-first-ok`);
  await expectStatus(page, "PATCH", `/api/zenith/deals/${dealId}`, 200, {
    stage_id: stageTwo,
  });
  markProgress(`tenant:${suffix}:stage-second-ok`);

  await expect.poll(async () => {
    const [row] = await sql`
      select count(*)::int as count
      from automation_runs
      where automation_id = ${automationId}::uuid and status = 'completed'
    `;
    return row.count;
  }).toBe(1);
  markProgress(`tenant:${suffix}:automation-run-ok`);

  await expect.poll(async () => {
    const [row] = await sql`
      select count(*)::int as count
      from notes
      where contact_id = ${contactId}::uuid
        and content = ${`Nota automática ${suffix}`}
    `;
    return row.count;
  }).toBe(1);
  markProgress(`tenant:${suffix}:automation-note-ok`);

  await expect.poll(async () => {
    const [row] = await sql`
      select count(*)::int as count
      from followup_enrollments
      where sequence_id = ${followupId}::uuid and status = 'active'
    `;
    return row.count;
  }).toBe(1);
  markProgress(`tenant:${suffix}:followup-enrollment-ok`);

  const [stageActivity] = await sql`
    select count(*)::int as count
    from activities
    where deal_id = ${dealId}::uuid and type = 'deal_stage_changed'
  `;
  expect(stageActivity.count).toBe(1);
  markProgress(`tenant:${suffix}:stage-activity-ok`);

  const timeline = await expectStatus(
    page,
    "GET",
    `/api/zenith/timeline?contactId=${contactId}`,
    200,
  );
  markProgress(`tenant:${suffix}:timeline-api-ok`);
  expect(JSON.stringify(timeline)).toContain(`Tarefa E2E ${suffix}`);
  expect(JSON.stringify(timeline)).toContain(`Atividade manual ${suffix}`);

  const dealTimeline = await expectStatus(
    page,
    "GET",
    `/api/zenith/timeline?dealId=${dealId}`,
    200,
  );
  expect(JSON.stringify(dealTimeline)).toContain(`Tarefa E2E ${suffix}`);
  expect(JSON.stringify(dealTimeline)).toContain(`Atividade manual ${suffix}`);
  markProgress(`tenant:${suffix}:resources:done`);

  return {
    pipelineId,
    stageOne,
    stageTwo,
    channelId,
    automationId,
    followupId,
    contactId,
    phone,
    dealId,
    taskId: String(task.id),
    noteId: String(note.id),
  };
}

test.describe.serial("Zenith CRM commercial journey and transversal tenancy", () => {
  test.beforeAll(async () => {
    mkdirSync("test-results", { recursive: true });
    writeFileSync(progressPath, "");
    markProgress("seed:start");
    await seedE2e();
    markProgress("seed:done");
  });

  test.afterAll(async () => {
    markProgress("afterAll:seed-db:start");
    await closeSeedConnection();
    markProgress("afterAll:seed-db:done");
    markProgress("afterAll:assertion-db:start");
    await sql.end({ timeout: 2 });
    markProgress("afterAll:assertion-db:done");
  });

  test("interface, API, worker, persistence and tenant isolation", async ({ browser }) => {
    markProgress("scenario:start");
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const contextAgentA = await browser.newContext();
    const contextSuperadmin = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const pageAgentA = await contextAgentA.newPage();
    const pageSuperadmin = await contextSuperadmin.newPage();

    try {
    await login(pageA, E2E_USERS.ownerA);
    await login(pageB, E2E_USERS.ownerB);
    await login(pageAgentA, E2E_USERS.agentA);
    const superadminLogin = await pageSuperadmin.request.post(
      "/api/auth/zenith/login",
      {
        data: {
      email: E2E_USERS.superadmin,
      password: E2E_PASSWORD,
        },
        timeout: 30_000,
        failOnStatusCode: false,
      },
    );
    expect(superadminLogin.status(), await superadminLogin.text()).toBe(200);
    rememberSessionCookie(pageSuperadmin, superadminLogin.headers()["set-cookie"]);
    markProgress("logins:done");

    const tenantA = await createTenantResources(pageA, "A");
    const tenantB = await createTenantResources(pageB, "B");
    markProgress("tenants:done");

    await pageA.goto("/contacts");
    await expect(pageA.getByText("Contato E2E A").first()).toBeVisible();
    await expect(pageA.getByText("Contato E2E B")).toHaveCount(0);
    await pageA.reload();
    await expect(pageA.getByText("Contato E2E A").first()).toBeVisible();

    await pageA.evaluate(() => {
      const state = window as typeof window & { __zenithEvents?: string[]; __zenithSse?: EventSource };
      state.__zenithEvents = [];
      state.__zenithSse = new EventSource("/api/zenith/inbox/events");
      state.__zenithSse.onmessage = (event) => state.__zenithEvents?.push(event.data);
    });

    const inboundB = await expectStatus(
      pageB,
      "POST",
      `/api/webhooks/zenith/test-inbound/${tenantB.channelId}`,
      200,
      {
        provider_message_id: `b-${randomUUID()}`,
        from: tenantB.phone,
        contact_name: "Contato E2E B",
        text: "Resposta cliente B",
      },
    );
    const conversationB = String(object(inboundB).conversationId);
    await pageA.waitForTimeout(750);
    expect(await pageA.evaluate(() => {
      const state = window as typeof window & { __zenithEvents?: string[] };
      return state.__zenithEvents?.length ?? 0;
    })).toBe(0);

    const inboundA = await expectStatus(
      pageA,
      "POST",
      `/api/webhooks/zenith/test-inbound/${tenantA.channelId}`,
      200,
      {
        provider_message_id: `a-${randomUUID()}`,
        from: tenantA.phone,
        contact_name: "Contato E2E A",
        text: "Resposta cliente A",
      },
    );
    const conversationA = String(object(inboundA).conversationId);

    await expect.poll(async () => pageA.evaluate(() => {
      const state = window as typeof window & { __zenithEvents?: string[] };
      return state.__zenithEvents?.some((event) => event.includes("message")) ?? false;
    })).toBe(true);

    await expect.poll(async () => {
      const [row] = await sql`
        select status from followup_enrollments
        where sequence_id = ${tenantA.followupId}::uuid
      `;
      return row?.status;
    }).toBe("cancelled");

    await expect.poll(async () => {
      const [row] = await sql`
        select sla_status from conversations where id = ${conversationA}::uuid
      `;
      return row?.sla_status;
    }, { timeout: 30_000 }).toBe("overdue");

    const [agentA] = await sql`
      select u.id from users u where u.email = ${E2E_USERS.agentA}
    `;
    const [ownerA] = await sql`
      select u.id from users u where u.email = ${E2E_USERS.ownerA}
    `;
    const [ownerB] = await sql`
      select u.id from users u where u.email = ${E2E_USERS.ownerB}
    `;
    const [agentB] = await sql`
      select u.id from users u where u.email = ${E2E_USERS.agentB}
    `;

    await expectStatus(pageA, "PATCH", `/api/zenith/conversations/${conversationA}`, 200, {
      assigned_agent_id: agentA.id,
    });
    await expectStatus(pageAgentA, "PATCH", `/api/zenith/conversations/${conversationA}`, 200, {
      assigned_agent_id: ownerA.id,
    });
    await expectStatus(pageAgentA, "POST", "/api/zenith/members", 403, {
      email: "forbidden@zenith-e2e.invalid",
    });

    await expectStatus(
      pageA,
      "POST",
      `/api/zenith/conversations/${conversationA}/messages`,
      201,
      { content_type: "text", content_text: "Resposta humana válida" },
    );

    await expect.poll(async () => {
      const [row] = await sql`
        select first_unreplied_message_at, sla_status, ai_autoreply_disabled
        from conversations where id = ${conversationA}::uuid
      `;
      return row;
    }).toMatchObject({
      first_unreplied_message_at: null,
      sla_status: "ok",
      ai_autoreply_disabled: true,
    });

    const adapterEvidence = object(
      await (await fetch("http://127.0.0.1:3199/__requests")).json(),
    );
    expect(Array.isArray(adapterEvidence.requests)).toBe(true);
    expect((adapterEvidence.requests as unknown[]).length).toBeGreaterThan(0);

    const exportA = object(await expectStatus(
      pageA,
      "GET",
      `/api/zenith/contacts/${tenantA.contactId}/export`,
      200,
    ));
    const authContext = object(
      await expectStatus(pageA, "GET", "/api/auth/zenith/context", 200),
    );
    expect(exportA.tenantId).toBe(object(authContext.account).id);

    const [audit] = await sql`
      select al.account_id, al.actor_user_id, al.action, al.entity_id, u.email
      from audit_logs al
      left join users u on u.id = al.actor_user_id
      where al.entity_id = ${tenantA.contactId}
      order by al.created_at desc limit 1
    `;
    expect(audit).toMatchObject({
      action: "EXPORT",
      entity_id: tenantA.contactId,
      email: E2E_USERS.ownerA,
    });

    const [voiceChannelB] = await sql`
      insert into voice_channels (
        account_id, created_by_user_id, name, provider, config,
        is_active, is_default, allow_inbound, allow_outbound
      ) values (
        (select id from accounts where name = 'Zenith E2E Tenant B'),
        ${ownerB.id}::uuid,
        'Voice B E2E', 'wacalls', '{}'::jsonb, true, true, true, true
      ) returning id
    `;
    const [callB] = await sql`
      insert into calls (
        account_id, voice_channel_id, provider, direction, state,
        contact_id, from_phone, to_phone
      ) values (
        (select id from accounts where name = 'Zenith E2E Tenant B'),
        ${voiceChannelB.id}::uuid, 'wacalls', 'inbound', 'ended',
        ${tenantB.contactId}::uuid, ${tenantB.phone}, '+5565999000999'
      ) returning id
    `;

    const [outboxBefore] = await sql`
      select count(*)::int as count from automation_events_outbox
      where account_id = (select id from accounts where name = 'Zenith E2E Tenant B')
    `;

    const blockedRequests: Array<[string, string, number, unknown?]> = [
      ["GET", `/api/zenith/contacts/${tenantB.contactId}`, 404],
      ["PATCH", `/api/zenith/deals/${tenantB.dealId}`, 404, { title: "intrusion" }],
      ["PATCH", `/api/zenith/tasks/${tenantB.taskId}`, 404, { title: "intrusion" }],
      ["GET", `/api/zenith/conversations/${conversationB}`, 404],
      ["GET", `/api/zenith/conversations/${conversationB}/messages`, 404],
      ["GET", `/api/zenith/automations/${tenantB.automationId}`, 404],
      ["GET", `/api/zenith/followups/${tenantB.followupId}`, 404],
      ["GET", `/api/zenith/contacts/${tenantB.contactId}/export`, 404],
      ["GET", `/api/zenith/calls/${callB.id}`, 404],
      ["PATCH", `/api/zenith/conversations/${conversationA}`, 400, { assigned_agent_id: agentB.id }],
      ["POST", "/api/zenith/tasks", 400, { title: "intrusion", contactId: tenantB.contactId }],
      ["POST", "/api/zenith/conversations", 404, { contact_id: tenantB.contactId }],
      ["POST", "/api/zenith/deals", 400, {
        title: "intrusion",
        pipeline_id: tenantB.pipelineId,
        stage_id: tenantB.stageOne,
      }],
    ];
    for (const [method, path, status, data] of blockedRequests) {
      await expectStatus(pageA, method, path, status, data);
    }

    const searchB = object(
      await expectStatus(pageA, "GET", "/api/zenith/contacts?search=Contato%20E2E%20B", 200),
    );
    expect(searchB.items).toEqual([]);
    const radarB = object(
      await expectStatus(pageA, "GET", "/api/zenith/conversations?search=Contato%20E2E%20B", 200),
    );
    expect(radarB.items).toEqual([]);

    const [outboxAfter] = await sql`
      select count(*)::int as count from automation_events_outbox
      where account_id = (select id from accounts where name = 'Zenith E2E Tenant B')
    `;
    expect(outboxAfter.count).toBe(outboxBefore.count);

    await expectStatus(pageA, "GET", "/api/platform/accounts", 403);
    await expectStatus(pageSuperadmin, "GET", "/api/platform/accounts", 200);

    const [memberA] = await sql`
      select am.id from account_members am
      join users u on u.id = am.user_id
      where u.email = ${E2E_USERS.agentA}
    `;
    await expectStatus(pageA, "DELETE", `/api/zenith/members/${memberA.id}`, 200);
    await expectStatus(pageAgentA, "GET", "/api/auth/zenith/context", 401);

    await pageA.evaluate(() => {
      const state = window as typeof window & { __zenithSse?: EventSource };
      state.__zenithSse?.close();
    });
    markProgress("scenario:assertions-done");
    } finally {
      const contexts = [
        ["tenant-a", contextA],
        ["tenant-b", contextB],
        ["agent-a", contextAgentA],
        ["superadmin", contextSuperadmin],
      ] as const;

      for (const [name, context] of contexts) {
        markProgress(`teardown:${name}:pages:start`);
        await Promise.all(
          context.pages().map((page) => page.close({ runBeforeUnload: false })),
        );
        markProgress(`teardown:${name}:pages:done`);
        await context.close();
        markProgress(`teardown:${name}:context:done`);
      }
    }
  });
});
