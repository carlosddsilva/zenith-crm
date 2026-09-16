import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { canManageMembers, isAccountRole } from "@/lib/auth/roles";
import {
  getZenithAccountContext,
  ZenithForbiddenError,
  ZenithUnauthorizedError,
} from "@/lib/auth/zenith-account";
import { db } from "@/lib/db/client";
import { accountMembers, users } from "@/lib/db/schema";
import type { AccountMember } from "@/types";

export async function GET() {
  try {
    const context = await getZenithAccountContext();
    const rows = await db
      .select({
        userId: users.id,
        fullName: users.name,
        email: users.email,
        role: accountMembers.role,
        joinedAt: accountMembers.createdAt,
      })
      .from(accountMembers)
      .innerJoin(users, eq(users.id, accountMembers.userId))
      .where(eq(accountMembers.accountId, context.accountId))
      .orderBy(asc(accountMembers.createdAt));

    const canSeeEmails = canManageMembers(context.role);
    const members: AccountMember[] = rows.flatMap((row) => {
      if (!isAccountRole(row.role)) return [];
      return [{
        user_id: row.userId,
        full_name: row.fullName ?? "",
        email: canSeeEmails ? row.email : null,
        avatar_url: null,
        role: row.role,
        joined_at: row.joinedAt.toISOString(),
      }];
    });

    return NextResponse.json({ members });
  } catch (error) {
    if (error instanceof ZenithUnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof ZenithForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[account members] list failed", {
      errorCode: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
