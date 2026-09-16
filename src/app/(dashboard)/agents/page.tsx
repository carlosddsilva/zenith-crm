"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Bot, BookOpen, CircleDollarSign, Loader2 } from "lucide-react";

type AgentResponse = {
  item: null | {
    name: string;
    status: "inactive" | "active";
    currentVersion: number;
    hasGenerationKey: boolean;
    hasEmbeddingsKey: boolean;
  };
};
type DocumentItem = { id: string; title: string; status: string; errorCode: string | null };
type RunsResponse = {
  currency: string;
  totals: { runs: number; costMicros: number; inputTokens: number; outputTokens: number };
  budgets: Array<{ limitMicros: number; spentMicros: number; reservedMicros: number }>;
  items: Array<{ id: string; status: string; resultCode: string | null; errorCode: string | null; durationMs: number | null }>;
};

export default function AgentsPage() {
  const [agent, setAgent] = useState<AgentResponse | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [runs, setRuns] = useState<RunsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/zenith/ai/config").then((response) => response.ok ? response.json() : Promise.reject(response)),
      fetch("/api/zenith/ai/documents").then((response) => response.ok ? response.json() : Promise.reject(response)),
      fetch("/api/zenith/ai/runs").then((response) => response.ok ? response.json() : Promise.reject(response)),
    ]).then(([config, docs, usage]) => {
      setAgent(config);
      setDocuments(docs.items ?? []);
      setRuns(usage);
    }).catch(() => setError("Não foi possível carregar a observabilidade da IA."));
  }, []);

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!agent || !runs) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  const budget = runs.budgets[0];
  const handoffs = runs.items.filter((run) => run.status === "handoff").length;
  const failures = runs.items.filter((run) => run.status === "failed").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agente de IA</h1>
        <p className="mt-1 text-sm text-muted-foreground">Base, orçamento, fontes e transferências do agente do tenant.</p>
      </div>
      {!agent.item ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          O agente ainda não foi configurado. Ele permanece inativo até que provedor, modelos, preços, limites e chaves sejam definidos pela API administrativa.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          <Metric icon={Bot} label="Estado" value={`${agent.item.status} · v${agent.item.currentVersion}`} />
          <Metric icon={BookOpen} label="Base pronta" value={`${documents.filter((doc) => doc.status === "ready").length}/${documents.length}`} />
          <Metric icon={CircleDollarSign} label="Custo observado" value={formatMicros(runs.totals.costMicros, runs.currency)} />
          <Metric icon={AlertTriangle} label="Handoffs / falhas" value={`${handoffs} / ${failures}`} />
        </div>
      )}
      {budget && (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="font-semibold">Orçamento do período</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Gasto {formatMicros(budget.spentMicros, runs.currency)} · reservado {formatMicros(budget.reservedMicros, runs.currency)} · limite {formatMicros(budget.limitMicros, runs.currency)}
          </p>
        </section>
      )}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Base de conhecimento</h2>
        <div className="mt-3 space-y-2">
          {documents.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma fonte ingerida.</p>}
          {documents.map((document) => (
            <div key={document.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <span>{document.title}</span>
              <span className={document.errorCode ? "text-amber-300" : "text-muted-foreground"}>
                {document.status}{document.errorCode ? ` · ${document.errorCode}` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Execuções recentes</h2>
        <div className="mt-3 space-y-2">
          {runs.items.slice(0, 20).map((run) => (
            <div key={run.id} className="grid grid-cols-3 gap-2 rounded-lg border px-3 py-2 text-sm">
              <span>{run.status}</span>
              <span className="text-muted-foreground">{run.resultCode ?? run.errorCode ?? "—"}</span>
              <span className="text-right text-muted-foreground">{run.durationMs === null ? "—" : `${run.durationMs} ms`}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Bot; label: string; value: string }) {
  return <div className="rounded-xl border bg-card p-4"><Icon className="h-5 w-5 text-primary" /><p className="mt-3 text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}

function formatMicros(value: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(value ?? 0) / 1_000_000);
}
