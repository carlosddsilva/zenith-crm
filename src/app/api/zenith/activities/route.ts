import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { activities } from '@/lib/db/schema/activities';
import { eq, and, desc } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { apiErrorResponse } from '@/lib/api/error-response';

export async function GET(req: Request) {
  try {
    const { accountId } = await requireZenithRole('agent');
    const { searchParams } = new URL(req.url);

    const contactId = searchParams.get('contactId');
    const dealId = searchParams.get('dealId');
    const taskId = searchParams.get('taskId');
    const companyId = searchParams.get('companyId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = db.select().from(activities).where(eq(activities.accountId, accountId));

    if (contactId) {
      query = db.select().from(activities).where(and(eq(activities.accountId, accountId), eq(activities.contactId, contactId)));
    } else if (dealId) {
      query = db.select().from(activities).where(and(eq(activities.accountId, accountId), eq(activities.dealId, dealId)));
    } else if (taskId) {
      query = db.select().from(activities).where(and(eq(activities.accountId, accountId), eq(activities.taskId, taskId)));
    } else if (companyId) {
      query = db.select().from(activities).where(and(eq(activities.accountId, accountId), eq(activities.companyId, companyId)));
    }

    const results = await query.orderBy(desc(activities.occurredAt)).limit(limit).offset(offset);

    return NextResponse.json(results);
  } catch (error: unknown) {
    return apiErrorResponse(error, '[GET /api/zenith/activities]');
  }
}
