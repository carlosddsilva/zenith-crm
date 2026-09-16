import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { createSession } from "@/lib/auth/session-store";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const forwardedFor = request.headers.get("x-forwarded-for");
    const ipAddress = forwardedFor?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
    const rateLimit = checkRateLimit(`login:${ipAddress}`, RATE_LIMITS.login);
    if (!rateLimit.success) return rateLimitResponse(rateLimit);

    const body = await request.json();

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "E-mail e senha são obrigatórios." },
        { status: 400 },
      );
    }

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        passwordHash: users.passwordHash,
        status: users.status,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (
      !user ||
      !user.passwordHash ||
      user.status !== "active"
    ) {
      return NextResponse.json(
        { error: "E-mail ou senha inválidos." },
        { status: 401 },
      );
    }

    const valid = await verifyPassword(
      user.passwordHash,
      password,
    );

    if (!valid) {
      return NextResponse.json(
        { error: "E-mail ou senha inválidos." },
        { status: 401 },
      );
    }

    const userAgent =
      request.headers.get("user-agent");

    const session = await createSession({
      userId: user.id,
      ipAddress,
      userAgent,
    });

    await setSessionCookie(
      session.token,
      session.expiresAt,
    );

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("[zenith login] failed", {
      errorCode: error instanceof Error ? error.name : "UnknownError",
    });

    return NextResponse.json(
      { error: "Não foi possível realizar o login." },
      { status: 500 },
    );
  }
}
