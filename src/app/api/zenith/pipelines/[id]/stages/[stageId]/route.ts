import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { pipelines, pipelineStages, deals } from "@/lib/db/schema/pipeline";
import { eq, and } from "drizzle-orm";
import { requireZenithRole } from "@/lib/auth/zenith-account";
import { apiErrorResponse } from "@/lib/api/error-response";
import { isUuid } from "@/lib/validation/uuid";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; stageId: string }> }
) {
  try {
    const { accountId } = await requireZenithRole("admin");
    const { id, stageId } = await params;
    if (!isUuid(id) || !isUuid(stageId)) {
      return NextResponse.json({ error: "Invalid resource identifier" }, { status: 400 });
    }

    // Verify pipeline belongs to account
    const [pipeline] = await db
      .select({ id: pipelines.id })
      .from(pipelines)
      .where(and(eq(pipelines.id, id), eq(pipelines.accountId, accountId)));

    if (!pipeline) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
    }

    const [stage] = await db
      .select({ id: pipelineStages.id })
      .from(pipelineStages)
      .where(
        and(
          eq(pipelineStages.id, stageId),
          eq(pipelineStages.pipelineId, id),
        ),
      )
      .limit(1);

    if (!stage) {
      return NextResponse.json({ error: "Stage not found" }, { status: 404 });
    }

    // Ensure no deals exist in this stage
    const [dealCount] = await db
      .select({ id: deals.id })
      .from(deals)
      .where(and(eq(deals.stageId, stageId), eq(deals.accountId, accountId)))
      .limit(1);

    if (dealCount) {
      return NextResponse.json({ error: "Cannot delete stage containing deals" }, { status: 409 });
    }

    const [deleted] = await db
      .delete(pipelineStages)
      .where(and(eq(pipelineStages.id, stageId), eq(pipelineStages.pipelineId, id)))
      .returning({ id: pipelineStages.id });

    if (!deleted) {
      return NextResponse.json({ error: "Stage not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, id: deleted.id });
  } catch (error: unknown) {
    return apiErrorResponse(error, "[DELETE /api/zenith/pipelines/[id]/stages/[stageId]]");
  }
}
