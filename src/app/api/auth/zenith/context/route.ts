import { NextResponse } from "next/server";

import {
  getZenithAccountContext,
  ZenithForbiddenError,
  ZenithUnauthorizedError,
} from "@/lib/auth/zenith-account";

export const runtime = "nodejs";

export async function GET() {
  try {
    const context =
      await getZenithAccountContext();

    return NextResponse.json({
      user: {
        id: context.userId,
        email: context.email,
        name: context.name,
      },

      profile: {
        id: context.userId,
        full_name: context.name,
        email: context.email,
        avatar_url: null,
        role: null,
        beta_features: [],
        account_id: context.accountId,
        account_role: context.role,
      },

      account: {
        id: context.account.id,
        name: context.account.name,
        default_currency:
          context.account.defaultCurrency,
      },
    });
  } catch (error) {
    if (error instanceof ZenithUnauthorizedError) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 },
      );
    }

    if (error instanceof ZenithForbiddenError) {
      return NextResponse.json(
        { error: error.message },
        { status: 403 },
      );
    }

    console.error(
      "[Zenith account context]",
      {
        errorCode: error instanceof Error ? error.name : "UnknownError",
      },
    );

    return NextResponse.json(
      { error: "Erro ao carregar contexto da conta." },
      { status: 500 },
    );
  }
}
