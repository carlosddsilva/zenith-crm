import { requireZenithRole } from "@/lib/auth/zenith-account";
import { exportContactData } from "@/lib/privacy/export";
import { NextResponse } from "next/server";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireZenithRole("admin");
    const { id } = await params;

    const data = await exportContactData(context, id);

    // In a full implementation this might queue a job and return a tracking ID,
    // but for simplicity we stream the JSON directly.
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="dsr-export-${id}.json"`,
      },
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
