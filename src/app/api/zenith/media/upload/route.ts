import { NextResponse } from "next/server";
import { getZenithAccountContext, requireZenithRole } from "@/lib/auth/zenith-account";
import { db } from "@/lib/db/client";
import { mediaObjects } from "@/lib/db/schema";
import { extensionForMime } from "@/lib/media/filename";

export async function POST(request: Request) {
  try {
    const context = await requireZenithRole("agent");

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > 16 * 1024 * 1024) {
      return NextResponse.json({ error: "File exceeds 16MB limit" }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const [media] = await db
      .insert(mediaObjects)
      .values({
        accountId: context.accountId,
        filename: file.name || `upload.${extensionForMime(file.type)}`,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        content: buffer,
      })
      .returning({ id: mediaObjects.id });

    // The frontend will save this URL in `messages.media_url`
    const mediaUrl = `/api/zenith/media/${media.id}`;

    return NextResponse.json({
      mediaId: media.id,
      mediaUrl: mediaUrl,
    }, { status: 201 });

  } catch (error) {
    console.error("[media upload]", error);
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
