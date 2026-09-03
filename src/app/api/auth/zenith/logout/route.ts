import { NextResponse } from "next/server";

import {
  clearSessionCookie,
  readSessionToken,
} from "@/lib/auth/session-cookie";

import { revokeSessionToken } from "@/lib/auth/session-store";

export const runtime = "nodejs";

export async function POST() {
  const token = await readSessionToken();

  if (token) {
    await revokeSessionToken(token);
  }

  await clearSessionCookie();

  return NextResponse.json({
    success: true,
  });
}
