import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { automations } from '@/lib/db/schema/automations';
import { eq, and } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { apiErrorResponse } from '@/lib/api/error-response';
import { updateAutomationSchema } from '@/lib/automations/schema';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { accountId } = await requireZenithRole('agent');
    const { id } = await params;

    const [automation] = await db.select()
      .from(automations)
      .where(and(eq(automations.id, id), eq(automations.accountId, accountId)));

    if (!automation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(automation);
  } catch (error: unknown) {
    return apiErrorResponse(error, '[GET /api/zenith/automations/[id]]');
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { accountId, userId } = await requireZenithRole('admin');
    const rateLimit = checkRateLimit(
      `automation-update:${accountId}:${userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!rateLimit.success) return rateLimitResponse(rateLimit);
    const { id } = await params;
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
      .where(and(eq(automations.id, id), eq(automations.accountId, accountId)))
      .returning();

    return NextResponse.json(updated);
  } catch (error: unknown) {
    return apiErrorResponse(error, '[PATCH /api/zenith/automations/[id]]');
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { accountId } = await requireZenithRole('admin');
    const { id } = await params;

    const [deleted] = await db.delete(automations)
      .where(and(eq(automations.id, id), eq(automations.accountId, accountId)))
      .returning({ id: automations.id });

    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, id: deleted.id });
  } catch (error: unknown) {
    return apiErrorResponse(error, '[DELETE /api/zenith/automations/[id]]');
  }
}
