import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { authSessions, users } from "@/lib/db/schema";

const requestedSessionDays = Number(process.env.AUTH_SESSION_DAYS ?? "30");
const sessionDays = Number.isFinite(requestedSessionDays)
  ? Math.min(Math.max(Math.floor(requestedSessionDays), 1), 90)
  : 30;

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(input: {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);

  const expiresAt = new Date(
    Date.now() + sessionDays * 24 * 60 * 60 * 1000,
  );

  await db.insert(authSessions).values({
    userId: input.userId,
    tokenHash,
    expiresAt,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });

  return {
    token,
    expiresAt,
  };
}

export async function getSessionByToken(token: string) {
  const tokenHash = hashSessionToken(token);

  const [result] = await db
    .select({
      sessionId: authSessions.id,
      expiresAt: authSessions.expiresAt,
      userId: users.id,
      email: users.email,
      name: users.name,
      status: users.status,
      systemRole: users.systemRole,
    })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(
      and(
        eq(authSessions.tokenHash, tokenHash),
        gt(authSessions.expiresAt, new Date()),
        eq(users.status, "active"),
      ),
    )
    .limit(1);

  if (!result) {
    return null;
  }

  await db
    .update(authSessions)
    .set({
      lastUsedAt: new Date(),
    })
    .where(eq(authSessions.id, result.sessionId));

  return result;
}

export async function revokeSessionToken(token: string) {
  const tokenHash = hashSessionToken(token);

  await db
    .delete(authSessions)
    .where(eq(authSessions.tokenHash, tokenHash));
}

export async function revokeAllUserSessions(userId: string) {
  await db
    .delete(authSessions)
    .where(eq(authSessions.userId, userId));
}
