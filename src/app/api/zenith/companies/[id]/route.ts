import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import {
  activities,
  companies,
  contacts,
  deals,
  pipelineStages,
  tasks,
} from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { apiErrorResponse } from '@/lib/api/error-response';
import { z } from 'zod';

const updateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  legalName: z.string().optional().nullable(),
  document: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  website: z.string().url().optional().nullable().or(z.literal('')),
  address: z.any().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { accountId } = await requireZenithRole('agent');
    const { id } = await params;

    const [company] = await db
      .select()
      .from(companies)
      .where(and(eq(companies.id, id), eq(companies.accountId, accountId)))
      .limit(1);

    if (!company) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const [companyContacts, dealRows, companyActivities, companyTasks] =
      await Promise.all([
        db
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.companyId, id),
              eq(contacts.accountId, accountId),
            ),
          )
          .orderBy(desc(contacts.createdAt)),
        db
          .select({ deal: deals, stage: pipelineStages })
          .from(deals)
          .leftJoin(pipelineStages, eq(pipelineStages.id, deals.stageId))
          .where(
            and(eq(deals.companyId, id), eq(deals.accountId, accountId)),
          )
          .orderBy(desc(deals.createdAt)),
        db
          .select()
          .from(activities)
          .where(
            and(
              eq(activities.companyId, id),
              eq(activities.accountId, accountId),
            ),
          )
          .orderBy(desc(activities.occurredAt))
          .limit(10),
        db
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.companyId, id),
              eq(tasks.accountId, accountId),
              eq(tasks.status, 'pending'),
            ),
          )
          .orderBy(desc(tasks.createdAt)),
      ]);

    return NextResponse.json({
      ...company,
      contacts: companyContacts,
      deals: dealRows.map(({ deal, stage }) => ({ ...deal, stage })),
      activities: companyActivities,
      tasks: companyTasks,
    });
  } catch (error: unknown) {
    return apiErrorResponse(error, '[GET /api/zenith/companies/:id]');
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { accountId } = await requireZenithRole('agent');
    const { id } = await params;
    const body = await req.json();

    const result = updateCompanySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }

    const data = result.data;

    // Convert undefined/empty string edge cases for db insertion if needed
    if (data.email === '') data.email = null;
    if (data.website === '') data.website = null;

    const [updatedCompany] = await db
      .update(companies)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(companies.id, id), eq(companies.accountId, accountId)))
      .returning();

    if (!updatedCompany) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(updatedCompany);
  } catch (error: unknown) {
    return apiErrorResponse(error, '[PATCH /api/zenith/companies/:id]');
  }
}
