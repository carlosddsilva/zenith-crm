import { NextRequest, NextResponse } from "next/server";
import { and, count, eq, gte, sum, sql, desc, lt, lte, ne, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  contacts,
  companies,
  deals,
  tasks,
  conversations,
  calls,
  pipelineStages,
  pipelines,
  activities,
  users
} from "@/lib/db/schema";
import { requireZenithRole } from "@/lib/auth/zenith-account";
import type { DashboardMetrics, PipelineDonutData, PipelineStageSlice, ActivityItem, ActivityKind } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // Agent or higher can view dashboard
    const ctx = await requireZenithRole("agent");

    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");
    const pipelineId = searchParams.get("pipelineId");

    const now = new Date();
    // Default to 30 days ago if no range provided
    const fromDate = fromStr ? new Date(fromStr) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const toDate = toStr ? new Date(toStr) : now;

    // --- 1. Contacts & Companies ---
    const [
      totalContactsRes, newContactsRes,
      totalCompaniesRes, newCompaniesRes
    ] = await Promise.all([
      db.select({ count: count() }).from(contacts).where(eq(contacts.accountId, ctx.accountId)),
      db.select({ count: count() }).from(contacts).where(and(eq(contacts.accountId, ctx.accountId), gte(contacts.createdAt, fromDate), lte(contacts.createdAt, toDate))),
      db.select({ count: count() }).from(companies).where(eq(companies.accountId, ctx.accountId)),
      db.select({ count: count() }).from(companies).where(and(eq(companies.accountId, ctx.accountId), gte(companies.createdAt, fromDate), lte(companies.createdAt, toDate))),
    ]);

    // --- 2. Deals ---
    const dealsList = await db
      .select({
        status: deals.status,
        value: deals.value,
        stageId: deals.stageId,
        wonAt: deals.wonAt,
        lostAt: deals.lostAt,
      })
      .from(deals)
      .where(eq(deals.accountId, ctx.accountId));

    let dealsOpenCount = 0;
    let dealsWonCount = 0;
    let dealsLostCount = 0;
    let dealsOpenValue = 0;
    let dealsWonValue = 0;
    let dealsLostValue = 0;
    
    const byStage = new Map<string, { count: number; total: number }>();

    for (const d of dealsList) {
      const val = parseFloat(d.value?.toString() ?? "0") || 0;
      
      if (d.status === "open") {
        dealsOpenCount++;
        dealsOpenValue += val;
        
        // Add to stage funnel (only open deals, following legacy logic)
        const row = byStage.get(d.stageId) ?? { count: 0, total: 0 };
        row.count += 1;
        row.total += val;
        byStage.set(d.stageId, row);
      } else if (d.status === "won") {
        if (d.wonAt && d.wonAt >= fromDate && d.wonAt <= toDate) {
          dealsWonCount++;
          dealsWonValue += val;
        }
      } else if (d.status === "lost") {
        if (d.lostAt && d.lostAt >= fromDate && d.lostAt <= toDate) {
          dealsLostCount++;
          dealsLostValue += val;
        }
      }
    }

    // --- 3. Pipeline Funnel ---
    let effectivePipelineId = pipelineId;
    if (!effectivePipelineId) {
      // Find the first pipeline deterministically if none is selected
      const firstPipeline = await db.select({ id: pipelines.id }).from(pipelines).where(eq(pipelines.accountId, ctx.accountId)).orderBy(pipelines.createdAt).limit(1);
      if (firstPipeline.length > 0) {
        effectivePipelineId = firstPipeline[0].id;
      }
    }

    let stages: PipelineStageSlice[] = [];
    if (effectivePipelineId) {
      const pStages = await db.select().from(pipelineStages).where(eq(pipelineStages.pipelineId, effectivePipelineId)).orderBy(pipelineStages.position);
      
      stages = pStages
        .map((s) => ({
          id: s.id,
          name: s.name,
          color: s.color || "#64748b",
          dealCount: byStage.get(s.id)?.count ?? 0,
          totalValue: byStage.get(s.id)?.total ?? 0,
        }))
        .filter((s) => s.totalValue > 0 || s.dealCount > 0);
    }
    const funnel: PipelineDonutData = {
      stages,
      totalValue: stages.reduce((sum, s) => sum + s.totalValue, 0),
    };

    // --- 4. Tasks ---
    const allTasks = await db.select({
      status: tasks.status,
      dueAt: tasks.dueAt,
      completedAt: tasks.completedAt
    }).from(tasks).where(eq(tasks.accountId, ctx.accountId));

    let tasksOpen = 0;
    let tasksOverdue = 0;
    let tasksDueToday = 0;
    let tasksCompletedInPeriod = 0;
    
    // Normalize today for comparison
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    for (const t of allTasks) {
      if (t.status !== 'completed' && t.status !== 'cancelled') {
        tasksOpen++;
        
        if (t.dueAt) {
          if (t.dueAt < todayStart) {
            tasksOverdue++;
          }
          if (t.dueAt >= todayStart && t.dueAt <= todayEnd) {
            tasksDueToday++;
          }
        }
      }
      
      if (t.status === 'completed' && t.completedAt) {
        if (t.completedAt >= fromDate && t.completedAt <= toDate) {
          tasksCompletedInPeriod++;
        }
      }
    }

    // --- 5. Inbox Conversations ---
    const [convOpenRes, convPendingRes, convUnreadRes] = await Promise.all([
      db.select({ count: count() }).from(conversations).where(and(eq(conversations.accountId, ctx.accountId), eq(conversations.status, "open"))),
      db.select({ count: count() }).from(conversations).where(and(eq(conversations.accountId, ctx.accountId), eq(conversations.status, "pending"))),
      db.select({ count: count() }).from(conversations).where(and(eq(conversations.accountId, ctx.accountId), gte(conversations.unreadCount, 1))),
    ]);

    // --- 6. Voice Calls ---
    const callsList = await db.select({
      state: calls.state,
      startedAt: calls.startedAt
    }).from(calls).where(and(
      eq(calls.accountId, ctx.accountId),
      gte(calls.createdAt, fromDate),
      lte(calls.createdAt, toDate)
    ));

    let callsTotal = 0;
    let callsAnswered = 0;
    let callsMissed = 0;

    for (const c of callsList) {
      callsTotal++;
      if (c.state === 'ended' || c.state === 'active') {
        callsAnswered++; // Count as answered if active or ended normally (answered).
      } else if (c.state === 'failed' || c.state === 'rejected' || (c.state === 'ringing' && c.startedAt)) {
        callsMissed++;
      }
    }

    // --- 7. Activity Feed ---
    const recentActivities = await db.select({
      id: activities.id,
      type: activities.type,
      metadata: activities.metadata,
      occurredAt: activities.occurredAt,
      actorName: users.name
    })
    .from(activities)
    .leftJoin(users, eq(activities.actorUserId, users.id))
    .where(eq(activities.accountId, ctx.accountId))
    .orderBy(desc(activities.occurredAt))
    .limit(20);

    const activityItems: ActivityItem[] = recentActivities.map(a => {
      let text = `Activity: ${a.type}`;
      let kind: ActivityKind = 'message';
      let href: string | undefined = undefined;
      
      const meta = (a.metadata as any) || {};

      switch(a.type) {
        case 'contact_created':
          kind = 'contact';
          text = `New contact created: ${meta?.contactName || 'Unknown'}`;
          href = meta?.contactId ? `/contacts/${meta.contactId}` : '/contacts';
          break;
        case 'deal_created':
          kind = 'deal';
          text = `Deal "${meta?.dealTitle || 'Unknown'}" created`;
          href = meta?.dealId ? `/pipelines?d=${meta.dealId}` : '/pipelines';
          break;
        case 'deal_stage_changed':
          kind = 'deal';
          text = `Deal "${meta?.dealTitle || 'Unknown'}" moved to ${meta?.toStageName || 'another stage'}`;
          break;
        case 'task_created':
          kind = 'task';
          text = `Task "${meta?.taskTitle || 'Unknown'}" created`;
          break;
        case 'task_completed':
          kind = 'task';
          text = `Task "${meta?.taskTitle || 'Unknown'}" completed by ${a.actorName || 'User'}`;
          break;
        case 'note_created':
          kind = 'note';
          text = `Note added by ${a.actorName || 'User'}`;
          break;
        case 'company_created':
          kind = 'company';
          text = `Company "${meta?.companyName || 'Unknown'}" created`;
          href = '/companies';
          break;
        default:
          kind = 'message';
          text = `${a.type.replace(/_/g, ' ')}`;
          break;
      }

      return {
        id: a.id,
        kind,
        text,
        at: a.occurredAt.toISOString(),
        href
      };
    });

    const response: DashboardMetrics = {
      period: {
        from: fromDate.toISOString(),
        to: toDate.toISOString()
      },
      contacts: {
        total: totalContactsRes[0].count,
        newInPeriod: newContactsRes[0].count
      },
      companies: {
        total: totalCompaniesRes[0].count,
        newInPeriod: newCompaniesRes[0].count
      },
      deals: {
        open: dealsOpenCount,
        won: dealsWonCount,
        lost: dealsLostCount,
        openValue: dealsOpenValue,
        wonValue: dealsWonValue,
        lostValue: dealsLostValue
      },
      funnel,
      tasks: {
        open: tasksOpen,
        overdue: tasksOverdue,
        dueToday: tasksDueToday,
        completedInPeriod: tasksCompletedInPeriod
      },
      inbox: {
        open: convOpenRes[0].count,
        pending: convPendingRes[0].count,
        unread: convUnreadRes[0].count
      },
      calls: {
        totalInPeriod: callsTotal,
        answered: callsAnswered,
        missed: callsMissed
      },
      activities: activityItems
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[zenith dashboard]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
