import { eq } from "drizzle-orm";

import { getCurrentUser } from "./current-user";
import {
  hasMinRole,
  isAccountRole,
  type AccountRole,
} from "./roles";

import { db } from "@/lib/db/client";
import {
  accountMembers,
  accounts,
  plans,
} from "@/lib/db/schema";

export class ZenithUnauthorizedError extends Error {
  readonly status = 401;

  constructor(message = "Não autenticado.") {
    super(message);
    this.name = "ZenithUnauthorizedError";
  }
}

export class ZenithForbiddenError extends Error {
  readonly status = 403;

  constructor(message = "Acesso negado.") {
    super(message);
    this.name = "ZenithForbiddenError";
  }
}

export interface ZenithAccountContext {
  userId: string;
  email: string;
  name: string | null;

  accountId: string;
  role: AccountRole;
  isSuspended: boolean;
  systemRole: "user" | "superadmin";

  account: {
    id: string;
    name: string;
    defaultCurrency: string;
    planId: string | null;
  };
}

export async function getZenithAccountContext():
Promise<ZenithAccountContext> {
  const user = await getCurrentUser();

  if (!user) {
    throw new ZenithUnauthorizedError();
  }

  const rows = await db
    .select({
      accountId: accountMembers.accountId,
      role: accountMembers.role,
      accountName: accounts.name,
      accountStatus: accounts.status,
      defaultCurrency: accounts.defaultCurrency,
      planId: accounts.planId,
    })
    .from(accountMembers)
    .innerJoin(
      accounts,
      eq(accountMembers.accountId, accounts.id),
    )
    .where(eq(accountMembers.userId, user.userId))
    .limit(2);

  if (rows.length === 0) {
    throw new ZenithForbiddenError(
      "Usuário não está vinculado a uma empresa.",
    );
  }

  if (rows.length > 1) {
    throw new ZenithForbiddenError(
      "Usuário possui mais de uma empresa vinculada.",
    );
  }

  const membership = rows[0];

  if (membership.accountStatus === "disabled") {
    throw new ZenithForbiddenError(
      "Empresa está desativada.",
    );
  }

  if (!isAccountRole(membership.role)) {
    throw new ZenithForbiddenError(
      "Permissão de usuário inválida.",
    );
  }

  return {
    userId: user.userId,
    email: user.email,
    name: user.name,
    systemRole: user.systemRole,

    accountId: membership.accountId,
    role: membership.role,
    isSuspended: membership.accountStatus === "suspended",

    account: {
      id: membership.accountId,
      name: membership.accountName,
      defaultCurrency:
        membership.defaultCurrency ?? "BRL",
      planId: membership.planId,
    },
  };
}

export async function requireZenithRole(
  minimumRole: AccountRole,
) {
  const context = await getZenithAccountContext();

  if (!hasMinRole(context.role, minimumRole)) {
    throw new ZenithForbiddenError(
      `Esta operação requer permissão ${minimumRole} ou superior.`,
    );
  }

  if (minimumRole !== "viewer" && context.isSuspended) {
    throw new ZenithForbiddenError(
      "Sua empresa está suspensa. Operações de gravação bloqueadas.",
    );
  }

  return context;
}

export async function requireActiveAccount() {
  const context = await getZenithAccountContext();

  if (context.isSuspended) {
    throw new ZenithForbiddenError(
      "Sua empresa está suspensa. Operações de gravação bloqueadas.",
    );
  }

  return context;
}

export async function requireSuperadmin() {
  const user = await getCurrentUser();

  if (!user) {
    throw new ZenithUnauthorizedError();
  }

  if (user.systemRole !== "superadmin") {
    throw new ZenithForbiddenError("Acesso negado. Apenas superadmins podem acessar esta área.");
  }

  return user;
}
