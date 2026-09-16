import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { appointments } from '@/lib/db/schema/activities';
import { companies, contacts, deals } from '@/lib/db/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { apiErrorResponse } from '@/lib/api/error-response';
import { z } from 'zod';
import { publishEvent } from '@/lib/events/bus';
import { enqueueAppointmentSync } from '@/lib/google-calendar/queue';

const createAppointmentSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().nullable().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  timezone: z.string().default('UTC'),
  allDay: z.boolean().default(false),
  allDayStart: z.string().date().nullable().optional(),
  allDayEnd: z.string().date().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  dealId: z.string().uuid().nullable().optional(),
  companyId: z.string().uuid().nullable().optional(),
}).superRefine((data, ctx) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: data.timezone }); } catch {
    ctx.addIssue({ code: 'custom', message: 'Invalid timezone', path: ['timezone'] });
  }
  if (data.allDay) {
    if (!data.allDayStart || !data.allDayEnd || data.allDayEnd <= data.allDayStart) {
      ctx.addIssue({ code: 'custom', message: 'All-day end date must be after start date', path: ['allDayEnd'] });
    }
  } else if (!data.startTime || !data.endTime || new Date(data.endTime) <= new Date(data.startTime)) {
    ctx.addIssue({ code: 'custom', message: 'End time must be after start time', path: ['endTime'] });
  }
});

export async function GET(req: Request) {
  try {
    const { accountId } = await requireZenithRole('agent');
    const { searchParams } = new URL(req.url);

    const contactId = searchParams.get('contactId');
    const dealId = searchParams.get('dealId');
    const status = searchParams.get('status');
    const organizerUserId = searchParams.get('organizerUserId');

    let query = db.select().from(appointments).where(eq(appointments.accountId, accountId));

    if (contactId) {
      query = db.select().from(appointments).where(and(eq(appointments.accountId, accountId), eq(appointments.contactId, contactId)));
    }
    if (dealId) {
      query = db.select().from(appointments).where(and(eq(appointments.accountId, accountId), eq(appointments.dealId, dealId)));
    }
    if (status) {
      query = db.select().from(appointments).where(and(eq(appointments.accountId, accountId), eq(appointments.status, status as any)));
    }
    if (organizerUserId) {
      query = db.select().from(appointments).where(and(eq(appointments.accountId, accountId), eq(appointments.organizerUserId, organizerUserId)));
    }

    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    const results = await query.orderBy(asc(appointments.startTime), desc(appointments.createdAt)).limit(limit).offset(offset);

    return NextResponse.json(results);
  } catch (error: unknown) {
    return apiErrorResponse(error, '[GET /api/zenith/appointments]');
  }
}

export async function POST(req: Request) {
  try {
    const { accountId, userId } = await requireZenithRole('agent');
    const body = await req.json();

    const result = createAppointmentSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }

    const data = result.data;

    const relatedChecks = await Promise.all([
      data.contactId ? db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, data.contactId), eq(contacts.accountId, accountId))).limit(1) : Promise.resolve([{ id: null }]),
      data.dealId ? db.select({ id: deals.id }).from(deals).where(and(eq(deals.id, data.dealId), eq(deals.accountId, accountId))).limit(1) : Promise.resolve([{ id: null }]),
      data.companyId ? db.select({ id: companies.id }).from(companies).where(and(eq(companies.id, data.companyId), eq(companies.accountId, accountId))).limit(1) : Promise.resolve([{ id: null }]),
    ]);
    if (relatedChecks.some((rows) => rows.length === 0)) {
      return NextResponse.json({ error: 'Invalid related resource' }, { status: 400 });
    }

    const newAppointment = await db.transaction(async (tx) => {
      const [inserted] = await tx.insert(appointments).values({
        accountId,
        title: data.title,
        description: data.description || null,
        startTime: data.allDay ? new Date(`${data.allDayStart}T00:00:00.000Z`) : new Date(data.startTime!),
        endTime: data.allDay ? new Date(`${data.allDayEnd}T00:00:00.000Z`) : new Date(data.endTime!),
        timezone: data.timezone,
        allDay: data.allDay,
        allDayStart: data.allDay ? data.allDayStart : null,
        allDayEnd: data.allDay ? data.allDayEnd : null,
        organizerUserId: userId,
        contactId: data.contactId || null,
        dealId: data.dealId || null,
        companyId: data.companyId || null,
        status: 'scheduled',
      }).returning();

      // Publish creation event (useful for ZC-06 calendar syncing)
      await publishEvent(tx, {
        accountId,
        triggerType: 'appointment.created' as any,
        entityType: 'appointment',
        entityId: inserted.id,
        payload: { appointment: inserted },
      });

      await enqueueAppointmentSync(tx, {
        accountId,
        userId,
        appointment: inserted,
        operation: 'upsert',
      });

      return inserted;
    });

    return NextResponse.json(newAppointment);
  } catch (error: unknown) {
    return apiErrorResponse(error, '[POST /api/zenith/appointments]');
  }
}
