"use client";

import {
  useEffect,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface ContextData {
  user: {
    id: string;
    email: string;
    name: string | null;
  };

  profile: {
    account_id: string;
    account_role: string;
  };

  account: {
    id: string;
    name: string;
    default_currency: string;
  };
}

export default function ZenithAuthTestPage() {
  const router = useRouter();

  const [data, setData] =
    useState<ContextData | null>(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    async function load() {
      const response = await fetch(
        "/api/auth/zenith/context",
        {
          credentials: "include",
          cache: "no-store",
        },
      );

      if (response.status === 401) {
        router.replace("/zenith-login");
        return;
      }

      if (!response.ok) {
        setLoading(false);
        return;
      }

      setData(await response.json());
      setLoading(false);
    }

    load();
  }, [router]);

  async function logout() {
    await fetch(
      "/api/auth/zenith/logout",
      {
        method: "POST",
        credentials: "include",
      },
    );

    router.replace("/zenith-login");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="p-8">
        Carregando...
      </main>
    );
  }

  if (!data) {
    return (
      <main className="p-8">
        Erro ao carregar contexto.
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">
          Zenith Auth
        </h1>

        <p className="text-muted-foreground">
          Sessão PostgreSQL validada no navegador.
        </p>
      </div>

      <div className="rounded-lg border p-5">
        <dl className="space-y-3">
          <div>
            <dt className="text-sm text-muted-foreground">
              Usuário
            </dt>
            <dd>{data.user.name}</dd>
          </div>

          <div>
            <dt className="text-sm text-muted-foreground">
              E-mail
            </dt>
            <dd>{data.user.email}</dd>
          </div>

          <div>
            <dt className="text-sm text-muted-foreground">
              Empresa
            </dt>
            <dd>{data.account.name}</dd>
          </div>

          <div>
            <dt className="text-sm text-muted-foreground">
              Permissão
            </dt>
            <dd>{data.profile.account_role}</dd>
          </div>

          <div>
            <dt className="text-sm text-muted-foreground">
              Moeda
            </dt>
            <dd>{data.account.default_currency}</dd>
          </div>
        </dl>
      </div>

      <Button
        variant="destructive"
        onClick={logout}
      >
        Sair
      </Button>
    </main>
  );
}
