import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { pipelines, pipelineStages, deals } from "@/lib/db/schema/pipeline";
import { eq, and } from "drizzle-orm";
import { requireZenithRole } from "@/lib/auth/zenith-account";

export async function DELETE(
  req: Request,
  { params }: any
) {
  try {
    const { accountId } = await requireZenithRole("admin");
    const { id, stageId } = params;

    // Verify pipeline belongs to account
    const [pipeline] = await db
      .select({ id: pipelines.id })
      .from(pipelines)
      .where(and(eq(pipelines.id, id), eq(pipelines.accountId, accountId)));

    if (!pipeline) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
    }

    // Ensure no deals exist in this stage
    const [dealCount] = await db
      .select({ id: deals.id })
      .from(deals)
      .where(eq(deals.stageId, stageId))
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
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[DELETE /api/zenith/pipelines/[id]/stages/[stageId]]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
