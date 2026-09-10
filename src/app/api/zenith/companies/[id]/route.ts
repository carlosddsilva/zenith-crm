import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { companies } from '@/lib/db/schema/companies';
import { eq, and } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
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
  req: Request,
  { params }: any
) {
  try {
    const { accountId } = await requireZenithRole('agent');

    const company = await db.query.companies.findFirst({
      where: (companies, { eq, and }) =>
        and(eq(companies.id, params.id), eq(companies.accountId, accountId)),
      with: {
        contacts: {
          orderBy: (contacts, { desc }) => [desc(contacts.createdAt)],
        },
        deals: {
          orderBy: (deals, { desc }) => [desc(deals.createdAt)],
          with: {
            stage: true,
          }
        },
        activities: {
          orderBy: (activities, { desc }) => [desc(activities.occurredAt)],
          limit: 10,
        },
        tasks: {
          orderBy: (tasks, { desc }) => [desc(tasks.createdAt)],
          where: (tasks, { eq }) => eq(tasks.status, 'pending'),
        }
      },
    });

    if (!company) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(company);
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/zenith/companies/:id]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: any
) {
  try {
    const { accountId } = await requireZenithRole('agent');
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
      .where(and(eq(companies.id, params.id), eq(companies.accountId, accountId)))
      .returning();

    if (!updatedCompany) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(updatedCompany);
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[PATCH /api/zenith/companies/:id]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
