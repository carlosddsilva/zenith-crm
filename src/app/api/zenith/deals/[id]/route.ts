import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { deals } from '@/lib/db/schema/pipeline';
import { eq, and } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { accountId } = await requireZenithRole('agent');
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { error: 'Deal ID is required' },
        { status: 400 }
      );
    }

    const body = await req.json();

    const updateData: any = { updatedAt: new Date() };

    // Support both snake_case (legacy) and camelCase payloads for smooth migration
    if (body.title !== undefined) updateData.title = body.title.trim();
    if (body.value !== undefined) updateData.value = String(body.value);
    if (body.currency !== undefined) updateData.currency = body.currency;
    if (body.stage_id !== undefined) updateData.stageId = body.stage_id;
    if (body.contact_id !== undefined)
      updateData.contactId = body.contact_id || null;
    if (body.assigned_to !== undefined)
      updateData.assignedTo = body.assigned_to || null;
    if (body.notes !== undefined) updateData.notes = body.notes || null;

    if (body.expected_close_date !== undefined) {
      updateData.expectedCloseDate = body.expected_close_date
        ? new Date(body.expected_close_date)
        : null;
    }

    if (body.status !== undefined) {
      updateData.status = body.status;
      if (body.status === 'won') {
        updateData.wonAt = new Date();
        updateData.lostAt = null;
      } else if (body.status === 'lost') {
        updateData.lostAt = new Date();
        updateData.wonAt = null;
      } else {
        updateData.wonAt = null;
        updateData.lostAt = null;
      }
    }

    const [updated] = await db
      .update(deals)
      .set(updateData)
      .where(and(eq(deals.id, id), eq(deals.accountId, accountId)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    // Map back to snake_case for legacy frontend
    const dealRow = {
      ...updated,
      stage_id: updated.stageId,
      pipeline_id: updated.pipelineId,
      contact_id: updated.contactId,
      assigned_to: updated.assignedTo,
      expected_close_date: updated.expectedCloseDate,
      created_at: updated.createdAt,
      updated_at: updated.updatedAt,
      won_at: updated.wonAt,
      lost_at: updated.lostAt,
      account_id: updated.accountId,
    };

    return NextResponse.json(dealRow);
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[PATCH /api/zenith/deals/[id]]', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { accountId } = await requireZenithRole('admin'); // Maybe admin only to delete deals
    const { id } = params;

    const [deleted] = await db
      .delete(deals)
      .where(and(eq(deals.id, id), eq(deals.accountId, accountId)))
      .returning({ id: deals.id });

    if (!deleted) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, id: deleted.id });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[DELETE /api/zenith/deals/[id]]', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
