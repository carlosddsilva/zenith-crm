import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { mediaObjects } from "@/lib/db/schema";
import { getZenithAccountContext } from "@/lib/auth/zenith-account";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authenticate the session
    const context = await getZenithAccountContext();
    const { id } = await params;

    // 2. Query the media object ensuring Tenant Isolation
    const [media] = await db
      .select({
        content: mediaObjects.content,
        mimeType: mediaObjects.mimeType,
        filename: mediaObjects.filename,
        size: mediaObjects.size,
      })
      .from(mediaObjects)
      .where(
        and(
          eq(mediaObjects.id, id),
          eq(mediaObjects.accountId, context.accountId)
        )
      )
      .limit(1);

    if (!media) {
      return NextResponse.json({ error: "Media not found or unauthorized" }, { status: 404 });
    }

    // 3. Return the file bytes with appropriate headers
    return new NextResponse(new Uint8Array(media.content), {
      status: 200,
      headers: {
        "Content-Type": media.mimeType || "application/octet-stream",
        "Content-Length": media.size.toString(),
        "Content-Disposition": `inline; filename="${encodeURIComponent(media.filename)}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });

  } catch (error) {
    console.error("[media proxy]", error);
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
