import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { plans } from "@/lib/db/schema";
import { requireSuperadmin } from "@/lib/auth/zenith-account";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    await requireSuperadmin();
    const allPlans = await db.select().from(plans);
    return NextResponse.json({ data: allPlans });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireSuperadmin();
    const body = await req.json();

    const [newPlan] = await db.insert(plans).values({
      name: body.name,
      maxUsers: body.maxUsers,
      maxContacts: body.maxContacts,
      maxMonthlyMessages: body.maxMonthlyMessages,
      price: body.price,
      isPublic: body.isPublic ?? "true",
    }).returning();

    return NextResponse.json(newPlan);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
