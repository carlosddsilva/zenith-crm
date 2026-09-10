import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { pipelines } from '@/lib/db/schema/pipeline';
import { eq, desc } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';

export async function GET(req: Request) {
  try {
    const { accountId } = await requireZenithRole('agent');

    const allPipelines = await db
      .select()
      .from(pipelines)
      .where(eq(pipelines.accountId, accountId))
      .orderBy(desc(pipelines.createdAt));

    return NextResponse.json(allPipelines);
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/zenith/pipelines]', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    // Creating pipelines is an admin/settings-tier capability based on existing page.tsx
    const { accountId, userId } = await requireZenithRole('admin');
    const body = await req.json();

    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const [pipeline] = await db
      .insert(pipelines)
      .values({
        accountId,
        userId,
        name,
        description: body.description?.trim() || null,
      })
      .returning();

    return NextResponse.json(pipeline);
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[POST /api/zenith/pipelines]', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
