import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { automations } from '@/lib/db/schema/automations';
import { eq, and, desc } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { createAutomationSchema } from '@/lib/automations/schema';

export async function GET(req: Request) {
  try {
    const { accountId } = await requireZenithRole('agent');
    
    const items = await db.select()
      .from(automations)
      .where(eq(automations.accountId, accountId))
      .orderBy(desc(automations.createdAt));

    return NextResponse.json(items);
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/zenith/automations]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { accountId, userId } = await requireZenithRole('admin');
    const body = await req.json();

    const parsed = createAutomationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const data = parsed.data;

    const [created] = await db.insert(automations).values({
      accountId,
      createdByUserId: userId,
      name: data.name,
      description: data.description || null,
      status: data.status,
      triggerType: data.triggerType,
      triggerConfig: data.triggerConfig || {},
      conditions: data.conditions || [],
      actions: data.actions || [],
      activatedAt: data.status === 'active' ? new Date() : null,
    }).returning();

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[POST /api/zenith/automations]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
