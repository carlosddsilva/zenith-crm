import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { appointments } from '@/lib/db/schema/activities';
import { eq, and, inArray } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { apiErrorResponse } from '@/lib/api/error-response';
import { z } from 'zod';
import { publishEvent } from '@/lib/events/bus';
import { googleCalendarEventLinks } from '@/lib/db/schema';
import { enqueueAppointmentSync } from '@/lib/google-calendar/queue';

const updateAppointmentSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  timezone: z.string().optional(),
  allDay: z.boolean().optional(),
  allDayStart: z.string().date().nullable().optional(),
  allDayEnd: z.string().date().nullable().optional(),
  status: z.enum(['scheduled', 'completed', 'cancelled']).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { accountId } = await requireZenithRole('agent');
    const { id: appointmentId } = await params;
    const body = await req.json();

    const result = updateAppointmentSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }

    const data = result.data;

    const [existingAppointment] = await db
      .select()
      .from(appointments)
      .where(and(eq(appointments.id, appointmentId), eq(appointments.accountId, accountId)));

    if (!existingAppointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    const nextAllDay = data.allDay ?? existingAppointment.allDay;
    const nextStart = data.startTime ? new Date(data.startTime) : existingAppointment.startTime;
    const nextEnd = data.endTime ? new Date(data.endTime) : existingAppointment.endTime;
    const nextAllDayStart = data.allDayStart !== undefined ? data.allDayStart : existingAppointment.allDayStart;
    const nextAllDayEnd = data.allDayEnd !== undefined ? data.allDayEnd : existingAppointment.allDayEnd;
    const nextTimezone = data.timezone ?? existingAppointment.timezone;
    try { new Intl.DateTimeFormat('en-US', { timeZone: nextTimezone }); } catch {
      return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 });
    }
    if (nextAllDay ? (!nextAllDayStart || !nextAllDayEnd || nextAllDayEnd <= nextAllDayStart) : nextEnd <= nextStart) {
      return NextResponse.json({ error: 'End must be after start' }, { status: 400 });
    }

    const updatedAppointment = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(appointments)
        .set({
          title: data.title ?? existingAppointment.title,
          description: data.description !== undefined ? data.description : existingAppointment.description,
          startTime: nextAllDay ? new Date(`${nextAllDayStart}T00:00:00.000Z`) : nextStart,
          endTime: nextAllDay ? new Date(`${nextAllDayEnd}T00:00:00.000Z`) : nextEnd,
          timezone: nextTimezone,
          allDay: nextAllDay,
          allDayStart: nextAllDay ? nextAllDayStart : null,
          allDayEnd: nextAllDay ? nextAllDayEnd : null,
          status: data.status ?? existingAppointment.status,
          updatedAt: new Date(),
        })
        .where(eq(appointments.id, appointmentId))
        .returning();

      await publishEvent(tx, {
        accountId,
        triggerType: 'appointment.updated' as any,
        entityType: 'appointment',
        entityId: updated.id,
        payload: { appointment: updated },
      });

      await enqueueAppointmentSync(tx, {
        accountId,
        userId: existingAppointment.organizerUserId,
        appointment: updated,
        operation: updated.status === 'cancelled' ? 'cancel' : 'upsert',
      });

      return updated;
    });

    return NextResponse.json(updatedAppointment);
  } catch (error: unknown) {
    return apiErrorResponse(error, '[PATCH /api/zenith/appointments/[id]]');
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { accountId } = await requireZenithRole('agent');
    const { id: appointmentId } = await params;

    const [existingAppointment] = await db
      .select()
      .from(appointments)
      .where(and(eq(appointments.id, appointmentId), eq(appointments.accountId, accountId)));

    if (!existingAppointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    await db.transaction(async (tx) => {
      const [activeLink] = await tx
        .select({ id: googleCalendarEventLinks.id })
        .from(googleCalendarEventLinks)
        .where(and(
          eq(googleCalendarEventLinks.accountId, accountId),
          eq(googleCalendarEventLinks.appointmentId, appointmentId),
          inArray(googleCalendarEventLinks.syncState, ['synced', 'pending', 'conflict', 'error']),
        ))
        .limit(1);

      if (activeLink) {
        const [cancelled] = await tx
          .update(appointments)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(and(eq(appointments.id, appointmentId), eq(appointments.accountId, accountId)))
          .returning();
        await enqueueAppointmentSync(tx, {
          accountId,
          userId: existingAppointment.organizerUserId,
          appointment: cancelled,
          operation: 'cancel',
        });
      } else {
        await tx.delete(appointments).where(and(eq(appointments.id, appointmentId), eq(appointments.accountId, accountId)));
      }

      await publishEvent(tx, {
        accountId,
        triggerType: 'appointment.deleted' as any,
        entityType: 'appointment',
        entityId: appointmentId,
        payload: { appointmentId },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return apiErrorResponse(error, '[DELETE /api/zenith/appointments/[id]]');
  }
}
