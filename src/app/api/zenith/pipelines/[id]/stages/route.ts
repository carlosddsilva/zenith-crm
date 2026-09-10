import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { pipelines, pipelineStages } from '@/lib/db/schema/pipeline';
import { eq, and } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { accountId } = await requireZenithRole('agent');
    const { id } = params;

    // Verify pipeline belongs to account
    const [pipeline] = await db
      .select({ id: pipelines.id })
      .from(pipelines)
      .where(and(eq(pipelines.id, id), eq(pipelines.accountId, accountId)));

    if (!pipeline) {
      return NextResponse.json(
        { error: 'Pipeline not found' },
        { status: 404 }
      );
    }

    const stages = await db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.pipelineId, id))
      .orderBy(pipelineStages.position);

    return NextResponse.json(stages);
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/zenith/pipelines/[id]/stages]', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { accountId } = await requireZenithRole('admin');
    const { id } = params;

    const [pipeline] = await db
      .select({ id: pipelines.id })
      .from(pipelines)
      .where(and(eq(pipelines.id, id), eq(pipelines.accountId, accountId)));

    if (!pipeline) {
      return NextResponse.json(
        { error: 'Pipeline not found' },
        { status: 404 }
      );
    }

    const body = await req.json();
    const stagesPayload = body.stages || [];

    // The legacy app sent an upsert. We'll do a simple transaction:
    // Insert with onConflictDoUpdate
    const upsertedStages = [];
    if (stagesPayload.length > 0) {
      for (const stage of stagesPayload) {
        if (!stage.name) continue;

        const [upserted] = await db
          .insert(pipelineStages)
          .values({
            id: stage.id, // Explicit ID for upsert
            pipelineId: id,
            name: stage.name.trim(),
            color: stage.color,
            position: stage.position,
          })
          .onConflictDoUpdate({
            target: pipelineStages.id,
            set: {
              name: stage.name.trim(),
              color: stage.color,
              position: stage.position,
              updatedAt: new Date(),
            },
          })
          .returning();

        upsertedStages.push(upserted);
      }
    }

    return NextResponse.json(upsertedStages);
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[PUT /api/zenith/pipelines/[id]/stages]', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
