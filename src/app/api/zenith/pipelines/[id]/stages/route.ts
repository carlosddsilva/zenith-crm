import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { pipelines, pipelineStages } from '@/lib/db/schema/pipeline';
import { eq, and, inArray } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { apiErrorResponse } from '@/lib/api/error-response';
import { isUuid } from '@/lib/validation/uuid';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { accountId } = await requireZenithRole('agent');
    const { id } = await params;

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
  } catch (error: unknown) {
    return apiErrorResponse(error, '[GET /api/zenith/pipelines/[id]/stages]');
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { accountId } = await requireZenithRole('admin');
    const { id } = await params;

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

    const body = (await req.json()) as { stages?: unknown };
    if (!Array.isArray(body.stages) || body.stages.length > 100) {
      return NextResponse.json({ error: 'stages must be an array with at most 100 items' }, { status: 400 });
    }

    const stagesPayload: Array<{
      id: string;
      name: string;
      color: string;
      position: number;
    }> = [];
    for (const value of body.stages) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
      }
      const stage = value as Record<string, unknown>;
      const stageId = typeof stage.id === 'string' ? stage.id : '';
      const name = typeof stage.name === 'string' ? stage.name.trim() : '';
      const color = typeof stage.color === 'string' ? stage.color : '#3b82f6';
      const position = typeof stage.position === 'number' ? stage.position : -1;
      if (
        !isUuid(stageId) ||
        !name ||
        name.length > 100 ||
        !/^#[0-9a-f]{6}$/i.test(color) ||
        !Number.isInteger(position) ||
        position < 0 ||
        position >= 100
      ) {
        return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
      }
      stagesPayload.push({ id: stageId, name, color, position });
    }

    if (stagesPayload.length > 0) {
      const existingStages = await db
        .select({ id: pipelineStages.id, pipelineId: pipelineStages.pipelineId })
        .from(pipelineStages)
        .where(inArray(pipelineStages.id, stagesPayload.map((stage) => stage.id)));
      if (existingStages.some((stage) => stage.pipelineId !== id)) {
        return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
      }
    }

    const upsertedStages = await db.transaction(async (tx) => {
      const rows = [];
      for (const stage of stagesPayload) {
        const [updated] = await tx
          .update(pipelineStages)
          .set({
            name: stage.name,
            color: stage.color,
            position: stage.position,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(pipelineStages.id, stage.id),
              eq(pipelineStages.pipelineId, id),
            ),
          )
          .returning();

        if (updated) {
          rows.push(updated);
          continue;
        }

        const [inserted] = await tx
          .insert(pipelineStages)
          .values({
            id: stage.id,
            pipelineId: id,
            name: stage.name,
            color: stage.color,
            position: stage.position,
          })
          .returning();
        rows.push(inserted);
      }
      return rows;
    });

    return NextResponse.json(upsertedStages);
  } catch (error: unknown) {
    return apiErrorResponse(error, '[PUT /api/zenith/pipelines/[id]/stages]');
  }
}
