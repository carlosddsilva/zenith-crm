import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { pipelines, pipelineStages, deals } from '@/lib/db/schema/pipeline';
import { eq, and } from 'drizzle-orm';
import { requireZenithRole } from '@/lib/auth/zenith-account';
import { apiErrorResponse } from '@/lib/api/error-response';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { accountId } = await requireZenithRole('admin');
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Pipeline ID is required' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const [updated] = await db
      .update(pipelines)
      .set({
        name,
        description: body.description?.trim() ?? undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(pipelines.id, id), eq(pipelines.accountId, accountId)))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: 'Pipeline not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (error: unknown) {
    return apiErrorResponse(error, '[PATCH /api/zenith/pipelines/[id]]');
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { accountId } = await requireZenithRole('admin');
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Pipeline ID is required' },
        { status: 400 }
      );
    }

    const [deleted] = await db
      .delete(pipelines)
      .where(and(eq(pipelines.id, id), eq(pipelines.accountId, accountId)))
      .returning({ id: pipelines.id });

    if (!deleted) {
      return NextResponse.json(
        { error: 'Pipeline not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, id: deleted.id });
  } catch (error: unknown) {
    return apiErrorResponse(error, '[DELETE /api/zenith/pipelines/[id]]');
  }
}
