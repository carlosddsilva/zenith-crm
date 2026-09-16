import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { companies } from '@/lib/db/schema/companies';
import { eq, or, ilike, desc } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { apiErrorResponse } from '@/lib/api/error-response';
import { z } from 'zod';

const createCompanySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  legalName: z.string().optional().nullable(),
  document: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  website: z.string().url().optional().nullable().or(z.literal('')),
  address: z.any().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  try {
    const { accountId } = await requireZenithRole('agent');
    const { searchParams } = new URL(req.url);

    const search = searchParams.get('search');

    const results = await db.query.companies.findMany({
      where: (companies, { eq, and, or, ilike }) => {
        const conditions = [eq(companies.accountId, accountId)];
        if (search) {
          conditions.push(
            or(
              ilike(companies.name, `%${search}%`),
              ilike(companies.document, `%${search}%`)
            ) as any
          );
        }
        return and(...conditions);
      },
      orderBy: [desc(companies.createdAt)],
      limit: 200,
    });

    return NextResponse.json(results);
  } catch (error: unknown) {
    return apiErrorResponse(error, '[GET /api/zenith/companies]');
  }
}

export async function POST(req: Request) {
  try {
    const { accountId, userId } = await requireZenithRole('agent');
    const body = await req.json();

    const result = createCompanySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }

    const data = result.data;

    const [newCompany] = await db
      .insert(companies)
      .values({
        accountId,
        name: data.name,
        legalName: data.legalName || null,
        document: data.document || null,
        email: data.email || null,
        phone: data.phone || null,
        website: data.website || null,
        address: data.address || null,
        notes: data.notes || null,
        createdByUserId: userId,
      })
      .returning();

    return NextResponse.json(newCompany);
  } catch (error: unknown) {
    return apiErrorResponse(error, '[POST /api/zenith/companies]');
  }
}
