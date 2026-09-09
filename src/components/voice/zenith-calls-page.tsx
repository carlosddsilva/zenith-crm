"use client";

import {
  useCallback,
  useEffect,
  useState,
  useMemo,
} from "react";
import {
  Loader2,
  Phone,
  PhoneIncoming,
  PhoneOff,
  PhoneOutgoing,
  RefreshCcw,
  Search,
  Filter,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const PAGE_SIZE = 50;

interface CallContact {
  id: string;
  name: string | null;
  phone: string;
}

interface ZenithCall {
  id: string;
  voice_channel_id: string;
  provider: string;
  provider_call_id: string;
  direction: "inbound" | "outbound";
  state: "new" | "ringing" | "connecting" | "active" | "ended" | "failed" | "rejected";
  contact_id: string | null;
  assigned_agent_id: string | null;
  from_phone: string;
  to_phone: string;
  failure_reason: string | null;
  end_reason: string | null;
  started_at: string;
  ringing_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  contact: CallContact | null;
}

interface ListResponse {
  items: ZenithCall[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export function ZenithCallsPage() {
  const [calls, setCalls] = useState<ZenithCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [serverState, setServerState] = useState<string>("");
  const [serverSearch, setServerSearch] = useState<string>("");
  const [serverDirection, setServerDirection] = useState<string>("");

  const [localSearch, setLocalSearch] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setServerSearch((prev) => {
        if (prev !== localSearch) setPage(1);
        return localSearch;
      });
    }, 400);
    return () => clearTimeout(handler);
  }, [localSearch]);

  const loadCalls = useCallback(async (abortSignal?: AbortSignal) => {
    setLoading(true);
    setError(false);

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });

      if (serverState) {
        params.set("state", serverState);
      }
      if (serverSearch) {
        params.set("search", serverSearch);
      }
      if (serverDirection) {
        params.set("direction", serverDirection);
      }

      const response = await fetch(
        `/api/zenith/calls?${params.toString()}`,
        {
          credentials: "include",
          cache: "no-store",
          signal: abortSignal,
        },
      );

      if (response.status === 401) {
        window.location.href = "/zenith-login";
        return;
      }

      if (!response.ok) {
        throw new Error("Falha ao carregar histórico de chamadas");
      }

      const data = (await response.json()) as ListResponse;

      setCalls(data.items ?? []);
      setTotal(data.pagination?.total ?? 0);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("[zenith-calls] load failed", err);
      setError(true);
      toast.error("Não foi possível carregar as chamadas.");
    } finally {
      setLoading(false);
    }
  }, [page, serverState, serverSearch, serverDirection]);

  useEffect(() => {
    const controller = new AbortController();
    loadCalls(controller.signal);
    return () => controller.abort();
  }, [loadCalls]);

  function getDuration(c: ZenithCall) {
    if (c.state !== "ended" || !c.answered_at || !c.ended_at) {
      return "-";
    }
    const start = new Date(c.answered_at).getTime();
    const end = new Date(c.ended_at).getTime();
    const diff = Math.max(0, Math.floor((end - start) / 1000));
    
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    
    if (h > 0) {
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  function getStateBadge(state: string) {
    switch (state) {
      case "new": return <Badge variant="secondary">Nova</Badge>;
      case "ringing": return <Badge variant="outline" className="text-blue-500 border-blue-200">Chamando</Badge>;
      case "connecting": return <Badge variant="outline" className="text-blue-500 border-blue-200">Conectando</Badge>;
      case "active": return <Badge variant="default" className="bg-green-500 hover:bg-green-600">Em chamada</Badge>;
      case "ended": return <Badge variant="outline" className="text-gray-500 border-gray-200">Encerrada</Badge>;
      case "failed": return <Badge variant="destructive">Falhou</Badge>;
      case "rejected": return <Badge variant="destructive">Rejeitada</Badge>;
      default: return <Badge variant="secondary">{state}</Badge>;
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  
  // Resumo desta página
  const summary = useMemo(() => {
    let inbound = 0;
    let outbound = 0;
    let answered = 0;
    let failed = 0;
    calls.forEach((c) => {
      if (c.direction === "inbound") inbound++;
      else outbound++;
      
      if (c.state === "ended") answered++;
      if (c.state === "failed" || c.state === "rejected") failed++;
    });
    return { inbound, outbound, answered, failed };
  }, [calls]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Zenith Calls
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Histórico de chamadas
          </p>
        </div>
        <Button variant="outline" onClick={() => loadCalls()} disabled={loading}>
          <RefreshCcw className={`mr-2 size-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <p className="text-sm font-medium text-muted-foreground mt-4 mb-2">Resumo desta página:</p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="p-4 bg-card rounded-lg border border-border flex flex-col items-center justify-center">
          <span className="text-xs text-muted-foreground">Exibidas</span>
          <span className="text-xl font-bold">{calls.length}</span>
        </div>
        <div className="p-4 bg-card rounded-lg border border-border flex flex-col items-center justify-center">
          <span className="text-xs text-muted-foreground">Recebidas</span>
          <span className="text-xl font-bold text-blue-600">{summary.inbound}</span>
        </div>
        <div className="p-4 bg-card rounded-lg border border-border flex flex-col items-center justify-center">
          <span className="text-xs text-muted-foreground">Realizadas</span>
          <span className="text-xl font-bold text-green-600">{summary.outbound}</span>
        </div>
        <div className="p-4 bg-card rounded-lg border border-border flex flex-col items-center justify-center">
          <span className="text-xs text-muted-foreground">Atendidas</span>
          <span className="text-xl font-bold text-foreground">{summary.answered}</span>
        </div>
        <div className="p-4 bg-card rounded-lg border border-border flex flex-col items-center justify-center">
          <span className="text-xs text-muted-foreground">Falhas/Perdidas</span>
          <span className="text-xl font-bold text-destructive">{summary.failed}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center p-4 bg-card rounded-lg border border-border">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Buscar telefone..."
            className="pl-8 bg-background"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
          <select
            value={serverDirection}
            onChange={(e) => {
              setServerDirection(e.target.value);
              setPage(1);
            }}
            className="h-9 min-w-32 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          >
            <option value="">Todas as direções</option>
            <option value="inbound">Recebidas</option>
            <option value="outbound">Realizadas</option>
          </select>

          <select
            value={serverState}
            onChange={(e) => {
              setServerState(e.target.value);
              setPage(1);
            }}
            className="h-9 min-w-32 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          >
            <option value="">Todos os status</option>
            <option value="ended">Atendida/Finalizada</option>
            <option value="active">Em andamento</option>
            <option value="rejected">Rejeitada</option>
            <option value="failed">Falhou</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Direção</TableHead>
              <TableHead>Contato / Telefone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Canal</TableHead>
              <TableHead className="hidden lg:table-cell">Início</TableHead>
              <TableHead>Duração</TableHead>
              <TableHead className="hidden xl:table-cell">Motivo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <Loader2 className="mx-auto size-6 animate-spin text-primary" />
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={7} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <PhoneOff className="size-8 text-destructive" />
                    <span className="text-sm text-muted-foreground">
                      Erro ao carregar chamadas.
                    </span>
                    <Button variant="outline" size="sm" onClick={() => loadCalls()}>
                      Tentar novamente
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : calls.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Phone className="size-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Nenhuma chamada encontrada.
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              calls.map((c) => {
                const phone = c.direction === "inbound" ? c.from_phone : c.to_phone;
                const dateObj = new Date(c.answered_at || c.started_at);
                const dateStr = !isNaN(dateObj.getTime()) ? dateObj.toLocaleString("pt-BR", { 
                  dateStyle: "short", 
                  timeStyle: "short" 
                }) : "-";
                
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      {c.direction === "inbound" ? (
                        <div className="flex items-center text-blue-600 gap-2">
                          <PhoneIncoming className="size-4" />
                          <span className="text-sm">Recebida</span>
                        </div>
                      ) : (
                        <div className="flex items-center text-green-600 gap-2">
                          <PhoneOutgoing className="size-4" />
                          <span className="text-sm">Realizada</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {c.contact?.name || phone || "-"}
                        </span>
                        {c.contact?.name && (
                          <span className="text-xs text-muted-foreground">
                            {phone}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStateBadge(c.state)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground capitalize">
                      {c.provider === "wacalls" ? "WaCalls" : c.provider}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {dateStr}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono">{getDuration(c)}</span>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-muted-foreground truncate max-w-xs">
                      {c.end_reason || c.failure_reason || "-"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t border-border px-4 py-3 sm:px-6">
          <div className="hidden sm:block">
            <p className="text-sm text-muted-foreground">
              Mostrando página <span className="font-medium">{page}</span> de{" "}
              <span className="font-medium">{totalPages}</span> (
              <span className="font-medium">{total}</span> total)
            </p>
          </div>
          <div className="flex flex-1 justify-between sm:justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
