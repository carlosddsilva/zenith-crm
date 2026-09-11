import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { automations } from '@/lib/db/schema/automations';
import { eq, and } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { updateAutomationSchema } from '@/lib/automations/schema';

export async function GET(req: Request, { params }: any) {
  try {
    const { accountId } = await requireZenithRole('agent');
    const { id } = params;

    const [automation] = await db.select()
      .from(automations)
      .where(and(eq(automations.id, id), eq(automations.accountId, accountId)));

    if (!automation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(automation);
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/zenith/automations/[id]]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: any) {
  try {
    const { accountId } = await requireZenithRole('admin');
    const { id } = params;
    const body = await req.json();

    const parsed = updateAutomationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const data = parsed.data;

    const [existing] = await db.select()
      .from(automations)
      .where(and(eq(automations.id, id), eq(automations.accountId, accountId)));

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) {
      updateData.status = data.status;
      if (data.status === 'active' && existing.status !== 'active') {
        updateData.activatedAt = new Date();
      }
    }
    if (data.triggerType !== undefined) updateData.triggerType = data.triggerType;
    if (data.triggerConfig !== undefined) updateData.triggerConfig = data.triggerConfig;
    if (data.conditions !== undefined) updateData.conditions = data.conditions;
    if (data.actions !== undefined) updateData.actions = data.actions;

    const [updated] = await db.update(automations)
      .set(updateData)
      .where(eq(automations.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[PATCH /api/zenith/automations/[id]]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: any) {
  try {
    const { accountId } = await requireZenithRole('admin');
    const { id } = params;

    const [deleted] = await db.delete(automations)
      .where(and(eq(automations.id, id), eq(automations.accountId, accountId)))
      .returning({ id: automations.id });

    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, id: deleted.id });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[DELETE /api/zenith/automations/[id]]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
