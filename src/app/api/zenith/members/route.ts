import { eq, and, count } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, accountMembers, plans, accounts } from "@/lib/db/schema";
import { requireZenithRole, ZenithForbiddenError } from "@/lib/auth/zenith-account";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const context = await requireZenithRole("viewer");

    const members = await db
      .select({
        id: accountMembers.id,
        userId: users.id,
        email: users.email,
        name: users.name,
        role: accountMembers.role,
        status: users.status,
        createdAt: accountMembers.createdAt,
      })
      .from(accountMembers)
      .innerJoin(users, eq(accountMembers.userId, users.id))
      .where(eq(accountMembers.accountId, context.accountId));

    return NextResponse.json({ data: members });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function POST(req: Request) {
  try {
    const context = await requireZenithRole("admin");
    const body = await req.json();
    const { email, name, role = "agent" } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Check plan limits
    const accountData = await db.select({ planId: accounts.planId }).from(accounts).where(eq(accounts.id, context.accountId)).limit(1);
    let limit = 999999;
    
    if (accountData[0]?.planId) {
       const planData = await db.select({ maxUsers: plans.maxUsers }).from(plans).where(eq(plans.id, accountData[0].planId)).limit(1);
       if (planData[0] && planData[0].maxUsers !== "unlimited") {
          limit = parseInt(planData[0].maxUsers, 10);
       }
    }

    const [memberCountResult] = await db.select({ total: count() }).from(accountMembers).where(eq(accountMembers.accountId, context.accountId));
    
    if (memberCountResult.total >= limit) {
       return NextResponse.json({ error: `Quota exceeded: plan limits allow up to ${limit} users.` }, { status: 403 });
    }

    // Resolve user
    let user = await db.select().from(users).where(eq(users.email, email)).limit(1).then(res => res[0]);

    if (!user) {
      const [newUser] = await db.insert(users).values({
        email,
        name: name || email.split("@")[0],
        status: "pending",
      }).returning();
      user = newUser;
    }

    // Check if already in account
    const existingMembership = await db.select().from(accountMembers).where(and(eq(accountMembers.accountId, context.accountId), eq(accountMembers.userId, user.id))).limit(1);

    if (existingMembership.length > 0) {
      return NextResponse.json({ error: "User is already a member" }, { status: 409 });
    }

    const [newMember] = await db.insert(accountMembers).values({
      accountId: context.accountId,
      userId: user.id,
      role: role as any,
    }).returning();

    return NextResponse.json(newMember);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
