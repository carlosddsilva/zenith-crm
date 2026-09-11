import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { deals } from '@/lib/db/schema/pipeline';
import { eq, and } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';

export async function PATCH(
  req: Request,
  { params }: any
) {
  try {
    const { accountId, userId } = await requireZenithRole('agent');
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
    if (body.company_id !== undefined)
      updateData.companyId = body.company_id || null;
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

    const txResult = await db.transaction(async (tx) => {
      const [existingDeal] = await tx
        .select()
        .from(deals)
        .where(and(eq(deals.id, id), eq(deals.accountId, accountId)));

      if (!existingDeal) {
        return null;
      }

      const [updated] = await tx
        .update(deals)
        .set(updateData)
        .where(eq(deals.id, id))
        .returning();

      const { activities } = await import('@/lib/db/schema/activities');

      // Determine what activities to log
      if (updateData.stageId && updateData.stageId !== existingDeal.stageId) {
        await tx.insert(activities).values({
          accountId,
          type: 'deal_stage_changed',
          actorUserId: userId,
          dealId: updated.id,
          contactId: updated.contactId,
          companyId: updated.companyId,
          metadata: {
            title: updated.title,
            fromStageId: existingDeal.stageId,
            toStageId: updated.stageId,
          },
        });
      }

      if (updateData.status && updateData.status !== existingDeal.status) {
        let type = '';
        if (updateData.status === 'won') type = 'deal_won';
        else if (updateData.status === 'lost') type = 'deal_lost';
        else if (updateData.status === 'open' && existingDeal.status !== 'open') type = 'deal_reopened';

        if (type) {
          await tx.insert(activities).values({
            accountId,
            type,
            actorUserId: userId,
            dealId: updated.id,
            contactId: updated.contactId,
            companyId: updated.companyId,
            metadata: {
              title: updated.title,
            },
          });
        }
      }

      return { updated, changes: {
        stageChanged: updateData.stageId && updateData.stageId !== existingDeal.stageId,
        won: updateData.status === 'won' && existingDeal.status !== 'won',
        lost: updateData.status === 'lost' && existingDeal.status !== 'lost',
      } };
    });

    if (!txResult) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    // Map back to snake_case for legacy frontend
    const result = txResult.updated;
    const dealRow = {
      ...result,
      stage_id: result.stageId,
      pipeline_id: result.pipelineId,
      contact_id: result.contactId,
      company_id: result.companyId,
      assigned_to: result.assignedTo,
      expected_close_date: result.expectedCloseDate,
      created_at: result.createdAt,
      updated_at: result.updatedAt,
      won_at: result.wonAt,
      lost_at: result.lostAt,
      account_id: result.accountId,
    };

    // Publish Automation Events outside transaction
    try {
      const { publishEvent } = await import('@/lib/events/bus');
      if (txResult.changes.stageChanged) {
        publishEvent({
          accountId,
          triggerType: 'deal.stage_changed',
          entityType: 'deal',
          entityId: result.id,
          payload: { deal: result },
        });
      }
      if (txResult.changes.won) {
        publishEvent({
          accountId,
          triggerType: 'deal.won',
          entityType: 'deal',
          entityId: result.id,
          payload: { deal: result },
        });
      }
      if (txResult.changes.lost) {
        publishEvent({
          accountId,
          triggerType: 'deal.lost',
          entityType: 'deal',
          entityId: result.id,
          payload: { deal: result },
        });
      }
    } catch (evtErr) {
      console.error('[EventBus] Failed to publish deal events:', evtErr);
    }

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
  { params }: any
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
