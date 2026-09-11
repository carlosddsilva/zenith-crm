import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { tasks, activities } from '@/lib/db/schema/activities';
import { accountMembers } from '@/lib/db/schema/identity';
import { eq, and } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { z } from 'zod';

const updateTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').optional(),
  description: z.string().nullable().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
});

export async function PATCH(req: Request, { params }: any) {
  try {
    const { accountId, userId } = await requireZenithRole('agent');
    const taskId = params.id;
    const body = await req.json();

    const result = updateTaskSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }

    const data = result.data;

    // Check if task exists and belongs to account
    const [existingTask] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.accountId, accountId)));

    if (!existingTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Validate assigned user membership if provided
    if (data.assignedUserId && data.assignedUserId !== existingTask.assignedUserId) {
      const [membership] = await db
        .select()
        .from(accountMembers)
        .where(
          and(
            eq(accountMembers.accountId, accountId),
            eq(accountMembers.userId, data.assignedUserId)
          )
        );

      if (!membership) {
        return NextResponse.json({ error: 'Assigned user must be a member of this account' }, { status: 400 });
      }
    }

    const updatedTask = await db.transaction(async (tx) => {
      let completedAt = existingTask.completedAt;
      let activityType: string | null = null;

      if (data.status && data.status !== existingTask.status) {
        if (data.status === 'completed') {
          completedAt = new Date();
          activityType = 'task_completed';
        } else if (existingTask.status === 'completed' && (data.status === 'pending' || data.status === 'in_progress')) {
          completedAt = null;
          activityType = 'task_reopened';
        } else if (data.status === 'cancelled') {
          activityType = 'task_cancelled';
        }
      }

      const [updated] = await tx
        .update(tasks)
        .set({
          title: data.title ?? existingTask.title,
          description: data.description !== undefined ? data.description : existingTask.description,
          priority: data.priority ?? existingTask.priority,
          status: data.status ?? existingTask.status,
          dueAt: data.dueAt !== undefined ? (data.dueAt ? new Date(data.dueAt) : null) : existingTask.dueAt,
          assignedUserId: data.assignedUserId !== undefined ? data.assignedUserId : existingTask.assignedUserId,
          completedAt,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId))
        .returning();

      if (activityType) {
        await tx.insert(activities).values({
          accountId,
          type: activityType,
          actorUserId: userId,
          taskId: taskId,
          contactId: existingTask.contactId,
          dealId: existingTask.dealId,
          metadata: {
            title: updated.title,
            fromStatus: existingTask.status,
            toStatus: updated.status,
          },
        });
      }

      return updated;
    });

    // Publish Automation Events
    try {
      const { publishEvent } = await import('@/lib/events/bus');
      if (updatedTask.status === 'completed' && existingTask.status !== 'completed') {
        publishEvent({
          accountId,
          triggerType: 'task.completed',
          entityType: 'task',
          entityId: updatedTask.id,
          payload: { task: updatedTask },
        });
      }
    } catch (evtErr) {
      console.error('[EventBus] Failed to publish task events:', evtErr);
    }

    return NextResponse.json(updatedTask);
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[PATCH /api/zenith/tasks/[id]]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
