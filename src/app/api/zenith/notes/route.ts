import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { notes, activities } from '@/lib/db/schema/activities';
import { eq, and, desc } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { z } from 'zod';

const createNoteSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  contactId: z.string().uuid().nullable().optional(),
  dealId: z.string().uuid().nullable().optional(),
});

export async function GET(req: Request) {
  try {
    const { accountId } = await requireZenithRole('agent');
    const { searchParams } = new URL(req.url);

    const contactId = searchParams.get('contactId');
    const dealId = searchParams.get('dealId');

    let query = db.select().from(notes).where(eq(notes.accountId, accountId));

    if (contactId) {
      query = db.select().from(notes).where(and(eq(notes.accountId, accountId), eq(notes.contactId, contactId)));
    } else if (dealId) {
      query = db.select().from(notes).where(and(eq(notes.accountId, accountId), eq(notes.dealId, dealId)));
    }

    const results = await query.orderBy(desc(notes.createdAt));

    return NextResponse.json(results);
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/zenith/notes]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { accountId, userId } = await requireZenithRole('agent');
    const body = await req.json();

    const result = createNoteSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }

    const data = result.data;

    if (!data.contactId && !data.dealId) {
      return NextResponse.json({ error: 'A note must belong to a contact or a deal' }, { status: 400 });
    }

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

    const createdNote = await db.transaction(async (tx) => {
      const [newNote] = await tx
        .insert(notes)
        .values({
          accountId,
          content: data.content,
          contactId: data.contactId || null,
          dealId: data.dealId || null,
          createdByUserId: userId,
        })
        .returning();

      // Optionally, we can create an activity for note creation.
      await tx.insert(activities).values({
        accountId,
        type: 'note_created',
        actorUserId: userId,
        contactId: data.contactId || null,
        dealId: data.dealId || null,
        metadata: {
          noteId: newNote.id,
        },
      });

      return newNote;
    });

    return NextResponse.json(createdNote);
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[POST /api/zenith/notes]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
