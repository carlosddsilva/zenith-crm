import { eq, and, count } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accountMembers, authSessions } from "@/lib/db/schema";
import { requireZenithRole, ZenithForbiddenError } from "@/lib/auth/zenith-account";
import { NextResponse } from "next/server";
import { roleRank } from "@/lib/auth/roles";
import { revokeAllUserSessions } from "@/lib/auth/session-store";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireZenithRole("admin");
    const { id } = await params;
    const { role } = await req.json();

    if (role === "owner" && context.role !== "owner") {
      throw new ZenithForbiddenError("Only owners can elevate others to owner.");
    }

    // Prevent auto-downgrade of last admin/owner
    if ((role === "agent" || role === "viewer") && context.role === "owner") {
       // Just a sanity check. Real check involves counting owners.
       const member = await db.select().from(accountMembers).where(and(eq(accountMembers.id, id), eq(accountMembers.accountId, context.accountId))).limit(1).then(res => res[0]);
       
       if (member && (member.role === "owner" || member.role === "admin")) {
           const owners = await db.select({ total: count() }).from(accountMembers).where(and(eq(accountMembers.accountId, context.accountId), eq(accountMembers.role, member.role)));
           if (owners[0].total <= 1) {
              return NextResponse.json({ error: `Cannot downgrade the last ${member.role} of the account.` }, { status: 403 });
           }
       }
    }

    const [updated] = await db
      .update(accountMembers)
      .set({ role })
      .where(and(eq(accountMembers.id, id), eq(accountMembers.accountId, context.accountId)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireZenithRole("admin");
    const { id } = await params;

    const member = await db.select().from(accountMembers).where(and(eq(accountMembers.id, id), eq(accountMembers.accountId, context.accountId))).limit(1).then(res => res[0]);

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (member.role === "owner") {
      const owners = await db.select({ total: count() }).from(accountMembers).where(and(eq(accountMembers.accountId, context.accountId), eq(accountMembers.role, "owner")));
      if (owners[0].total <= 1) {
        return NextResponse.json({ error: "Cannot remove the last owner of the account." }, { status: 403 });
      }
    }

    await db.delete(accountMembers).where(eq(accountMembers.id, id));

    // Revoke sessions for the removed user
    await revokeAllUserSessions(member.userId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
