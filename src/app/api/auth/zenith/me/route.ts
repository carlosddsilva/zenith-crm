import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/current-user";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Não autenticado." },
      { status: 401 },
    );
  }

  return NextResponse.json({
    user: {
      id: user.userId,
      email: user.email,
      name: user.name,
      status: user.status,
    },
    session: {
      expiresAt: user.expiresAt,
    },
  });
}
