import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { deals } from "@/lib/db/schema/pipeline";
import { contacts } from "@/lib/db/schema/contacts";
import { companies } from "@/lib/db/schema/companies";
import { users } from "@/lib/db/schema/identity";
import { eq, and, desc } from "drizzle-orm";
import { requireZenithRole } from "@/lib/auth/zenith-account";

export async function GET(req: Request) {
  try {
    const { accountId } = await requireZenithRole("agent");
    const { searchParams } = new URL(req.url);
    const pipelineId = searchParams.get("pipelineId");

    if (!pipelineId) {
      return NextResponse.json({ error: "pipelineId is required" }, { status: 400 });
    }

    const dealsList = await db
      .select({
        deal: deals,
        contact: contacts,
        company: companies,
        assignee: users,
      })
      .from(deals)
      .leftJoin(contacts, eq(deals.contactId, contacts.id))
      .leftJoin(companies, eq(deals.companyId, companies.id))
      .leftJoin(users, eq(deals.assignedTo, users.id))
      .where(and(eq(deals.accountId, accountId), eq(deals.pipelineId, pipelineId)))
      .orderBy(desc(deals.createdAt));

    // Map to match the frontend expected format
    const formattedDeals = dealsList.map(({ deal, contact, company, assignee }) => ({
      ...deal,
      contact: contact || null,
      company: company || null,
      assignee: assignee || null,
      // Map JS camelCase back to snake_case for the legacy frontend to avoid mass UI changes
      stage_id: deal.stageId,
      pipeline_id: deal.pipelineId,
      contact_id: deal.contactId,
      company_id: deal.companyId,
      assigned_to: deal.assignedTo,
      expected_close_date: deal.expectedCloseDate,
      created_at: deal.createdAt,
      updated_at: deal.updatedAt,
      won_at: deal.wonAt,
      lost_at: deal.lostAt,
      account_id: deal.accountId,
    }));

    return NextResponse.json(formattedDeals);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/zenith/deals]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { accountId, userId } = await requireZenithRole("agent");
    const body = await req.json();

    const title = body.title?.trim();
    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!body.pipeline_id || !body.stage_id) {
      return NextResponse.json({ error: "Pipeline and Stage are required" }, { status: 400 });
    }

    const deal = await db.transaction(async (tx) => {
      const [newDeal] = await tx
        .insert(deals)
        .values({
          accountId,
          userId,
          pipelineId: body.pipeline_id,
          stageId: body.stage_id,
          contactId: body.contact_id || null,
          companyId: body.company_id || null,
          assignedTo: body.assigned_to || null,
          title,
          value: typeof body.value === "number" ? String(body.value) : (body.value || "0"),
          currency: body.currency || "USD",
          status: body.status || "open",
          notes: body.notes || null,
          expectedCloseDate: body.expected_close_date ? new Date(body.expected_close_date) : null,
        })
        .returning();

      const { activities } = await import('@/lib/db/schema/activities');
      await tx.insert(activities).values({
        accountId,
        type: 'deal_created',
        actorUserId: userId,
        dealId: newDeal.id,
        contactId: newDeal.contactId,
        companyId: newDeal.companyId,
        metadata: {
          title: newDeal.title,
          pipelineId: newDeal.pipelineId,
          stageId: newDeal.stageId,
        },
      });

      return newDeal;
    });

    // Re-select to return full projection if needed, or just return the deal
    const dealRow = {

      ...deal,
      stage_id: deal.stageId,
      pipeline_id: deal.pipelineId,
      contact_id: deal.contactId,
      company_id: deal.companyId,
      assigned_to: deal.assignedTo,
      expected_close_date: deal.expectedCloseDate,
      created_at: deal.createdAt,
      updated_at: deal.updatedAt,
      won_at: deal.wonAt,
      lost_at: deal.lostAt,
      account_id: deal.accountId,
    };

    return NextResponse.json(dealRow);
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/zenith/deals]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
