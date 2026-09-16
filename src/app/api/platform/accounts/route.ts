import { eq, count, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts, users, accountMembers, plans } from "@/lib/db/schema";
import { requireSuperadmin } from "@/lib/auth/zenith-account";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    await requireSuperadmin();

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = 20;
    const offset = (page - 1) * pageSize;

    const data = await db
      .select({
        id: accounts.id,
        name: accounts.name,
        status: accounts.status,
        defaultCurrency: accounts.defaultCurrency,
        createdAt: accounts.createdAt,
        ownerId: accounts.ownerUserId,
        ownerName: users.name,
        ownerEmail: users.email,
        planName: plans.name,
      })
      .from(accounts)
      .leftJoin(users, eq(accounts.ownerUserId, users.id))
      .leftJoin(plans, eq(accounts.planId, plans.id))
      .limit(pageSize)
      .offset(offset);

    const [countResult] = await db.select({ total: count() }).from(accounts);

    return NextResponse.json({
      data,
      meta: {
        total: countResult.total,
        page,
        pageSize,
        totalPages: Math.ceil(countResult.total / pageSize),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
