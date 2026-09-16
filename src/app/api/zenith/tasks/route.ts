import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { tasks, activities } from '@/lib/db/schema/activities';
import { accountMembers } from '@/lib/db/schema/identity';
import { eq, and, desc, asc } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { apiErrorResponse } from '@/lib/api/error-response';
import { z } from 'zod';

const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().nullable().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  dueAt: z.string().datetime().nullable().optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  dealId: z.string().uuid().nullable().optional(),
});

export async function GET(req: Request) {
  try {
    const { accountId } = await requireZenithRole('agent');
    const { searchParams } = new URL(req.url);

    const contactId = searchParams.get('contactId');
    const dealId = searchParams.get('dealId');
    const status = searchParams.get('status');
    const assignedUserId = searchParams.get('assignedUserId');

    let query = db.select().from(tasks).where(eq(tasks.accountId, accountId));

    // Dynamic filtering
    if (contactId) {
      query = db.select().from(tasks).where(and(eq(tasks.accountId, accountId), eq(tasks.contactId, contactId)));
    }
    if (dealId) {
      query = db.select().from(tasks).where(and(eq(tasks.accountId, accountId), eq(tasks.dealId, dealId)));
    }
    if (status) {
      query = db.select().from(tasks).where(and(eq(tasks.accountId, accountId), eq(tasks.status, status)));
    }
    if (assignedUserId) {
      query = db.select().from(tasks).where(and(eq(tasks.accountId, accountId), eq(tasks.assignedUserId, assignedUserId)));
    }

    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    const results = await query.orderBy(asc(tasks.dueAt), desc(tasks.createdAt)).limit(limit).offset(offset);

    return NextResponse.json(results);
  } catch (error: unknown) {
    return apiErrorResponse(error, '[GET /api/zenith/tasks]');
  }
}

export async function POST(req: Request) {
  try {
    const { accountId, userId } = await requireZenithRole('agent');
    const body = await req.json();

    const result = createTaskSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }

    const data = result.data;

    // Validate assigned user membership if provided
    if (data.assignedUserId) {
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

    // TODO: We could explicitly check contactId and dealId existence for this account
    // For now we assume Drizzle will handle any referential constraints, but cross-tenant
    // prevention is done via the application inserting the task with `accountId`, and the
    // constraints or manual validation. Let's do manual validation to be safe.

    // Instead of querying everything here, let's rely on standard constraints or just insert
    // If contactId is from another account, we want to reject it. Since contact schema doesn't
    // easily let us do compound FK here natively without redefining it, we'll validate.
    if (data.contactId) {
      const { contacts } = await import('@/lib/db/schema/contacts');
      const [contact] = await db.select().from(contacts).where(and(eq(contacts.id, data.contactId), eq(contacts.accountId, accountId)));
      if (!contact) return NextResponse.json({ error: 'Invalid contactId' }, { status: 400 });
    }

    if (data.dealId) {
      const { deals } = await import('@/lib/db/schema/pipeline');
      const [deal] = await db.select().from(deals).where(and(eq(deals.id, data.dealId), eq(deals.accountId, accountId)));
      if (!deal) return NextResponse.json({ error: 'Invalid dealId' }, { status: 400 });
    }

    // Insert task and activity in a transaction
    const createdTask = await db.transaction(async (tx) => {
      const [newTask] = await tx
        .insert(tasks)
        .values({
          accountId,
          title: data.title,
          description: data.description || null,
          priority: data.priority,
          dueAt: data.dueAt ? new Date(data.dueAt) : null,
          assignedUserId: data.assignedUserId || null,
          contactId: data.contactId || null,
          dealId: data.dealId || null,
          createdByUserId: userId,
          status: 'pending',
        })
        .returning();

      await tx.insert(activities).values({
        accountId,
        type: 'task_created',
        actorUserId: userId,
        taskId: newTask.id,
        contactId: data.contactId || null,
        dealId: data.dealId || null,
        metadata: {
          title: newTask.title,
          priority: newTask.priority,
        },
      });

      return newTask;
    });

    return NextResponse.json(createdTask);
  } catch (error: unknown) {
    return apiErrorResponse(error, '[POST /api/zenith/tasks]');
  }
}
