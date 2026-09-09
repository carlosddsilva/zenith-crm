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

  account: {
    id: string;
    name: string;
    defaultCurrency: string;
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

  if (membership.accountStatus !== "active") {
    throw new ZenithForbiddenError(
      "Empresa não está ativa.",
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

    accountId: membership.accountId,
    role: membership.role,

    account: {
      id: membership.accountId,
      name: membership.accountName,
      defaultCurrency:
        membership.defaultCurrency ?? "BRL",
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

  return context;
}
