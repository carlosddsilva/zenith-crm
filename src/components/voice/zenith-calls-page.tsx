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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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



interface ZenithCall {
  id: string;
  provider: string;
  provider_call_id: string | null;
  direction: "inbound" | "outbound";
  state: "new" | "ringing" | "connecting" | "active" | "ended" | "failed" | "rejected";
  from_phone: string;
  to_phone: string;
  failure_reason: string | null;
  end_reason: string | null;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  contact: {
    name: string | null;
  } | null;
  voice_channel?: { name: string; provider: string };
}

interface ListResponse {
  items: ZenithCall[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

interface CallEvent {
  id: string;
  event_type: string;
  state: string | null;
  occurred_at: string;
}

interface CallDetailsResponse {
  call: ZenithCall;
  events: CallEvent[];
}

function getDuration(c: ZenithCall) {
  if (!c.answered_at || !c.ended_at) {
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

function CallDetailsDrawer({
  callId,
  open,
  onOpenChange,
}: {
  callId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [details, setDetails] = useState<CallDetailsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const loadDetails = useCallback(
    async (id: string, abortSignal?: AbortSignal) => {
      setLoading(true);
      setError(false);
      try {
        const response = await fetch(`/api/zenith/calls/${id}`, {
          credentials: "include",
          cache: "no-store",
          signal: abortSignal,
        });

        if (response.status === 401) {
          window.location.href = "/zenith-login";
          return;
        }

        if (!response.ok) {
          throw new Error("Falha ao carregar detalhes da chamada");
        }

        const data = (await response.json()) as CallDetailsResponse;
        if (abortSignal?.aborted) return;

        setDetails(data);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        if (abortSignal?.aborted) return;
        console.error("[zenith-calls-detail] load failed", err);
        setError(true);
      } finally {
        if (!abortSignal?.aborted) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!open || !callId) {
      setDetails(null);
      return;
    }
    const controller = new AbortController();
    loadDetails(callId, controller.signal);
    return () => controller.abort();
  }, [callId, open, loadDetails]);

  const mapEventState = (state: string | null, type: string) => {
    if (state === "new") return "Chamada criada";
    if (state === "ringing") return "Chamando";
    if (state === "connecting") return "Conectando";
    if (state === "active") return "Atendida / Em chamada";
    if (state === "ended") return "Encerrada";
    if (state === "failed") return "Falhou";
    if (state === "rejected") return "Rejeitada";
    return type || "Desconhecido";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md w-[90vw] flex flex-col p-0">
        <SheetHeader className="p-6 pb-2">
          <SheetTitle>Detalhes da Chamada</SheetTitle>
          <SheetDescription>Informações completas e linha do tempo</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <Loader2 className="size-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Carregando detalhes...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
              <PhoneOff className="size-10 text-destructive" />
              <p className="text-sm text-muted-foreground">
                Não foi possível carregar os detalhes da chamada.
              </p>
              <Button onClick={() => callId && loadDetails(callId)} variant="outline">
                Tentar novamente
              </Button>
            </div>
          ) : details ? (
            <ScrollArea className="h-full">
              <div className="p-6 space-y-6">
                <div className="bg-card border rounded-lg p-4 space-y-4">
                  <div className="flex items-center gap-3 border-b pb-4">
                    <div className="p-2 bg-primary/10 rounded-full">
                      {details.call.direction === "inbound" ? (
                        <PhoneIncoming className="size-5 text-blue-600" />
                      ) : (
                        <PhoneOutgoing className="size-5 text-green-600" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">
                        {details.call.direction === "inbound" ? "Recebida de" : "Realizada para"}
                      </div>
                      <div className="font-semibold text-lg">
                        {details.call.direction === "inbound"
                          ? details.call.from_phone
                          : details.call.to_phone}
                      </div>
                    </div>
                    <div className="ml-auto">{getStateBadge(details.call.state)}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground mb-1">Contato</div>
                      <div className="font-medium">
                        {details.call.contact?.name || "-"}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-1">Duração</div>
                      <div className="font-mono font-medium">{getDuration(details.call)}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Filter className="size-4" />
                    Encerramento
                  </h3>
                  <div className="bg-muted/50 rounded-lg p-3 text-sm">
                    {details.call.failure_reason || details.call.end_reason || "-"}
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-semibold text-sm">Linha do tempo</h3>
                  <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                    {details.events.map((event) => {
                      const d = new Date(event.occurred_at);
                      const timeStr = !isNaN(d.getTime())
                        ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                        : "-";
                      return (
                        <div key={event.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                          <div className="flex items-center justify-center w-6 h-6 rounded-full border border-white bg-slate-200 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                          </div>
                          <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] p-3 rounded-lg border border-border bg-card shadow-sm">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm text-foreground">
                                {mapEventState(event.state, event.event_type)}
                              </span>
                              <time className="text-xs text-muted-foreground font-mono">
                                {timeStr}
                              </time>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {event.event_type}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h3 className="font-semibold text-sm">Informações técnicas</h3>
                  <div className="grid grid-cols-1 gap-2 text-xs font-mono bg-muted/30 p-3 rounded-lg border">
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground">ID da Chamada</span>
                      <span className="break-all">{details.call.id}</span>
                    </div>
                    <div className="flex flex-col gap-1 mt-2">
                      <span className="text-muted-foreground">Canal (Provider)</span>
                      <span>{details.call.voice_channel?.name || "-"} ({details.call.provider})</span>
                    </div>
                    <div className="flex flex-col gap-1 mt-2">
                      <span className="text-muted-foreground">ID no Provider</span>
                      <span className="break-all">{details.call.provider_call_id || "-"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
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
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
      
      if (c.answered_at) answered++;
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
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setSelectedCallId(c.id);
                      setDrawerOpen(true);
                    }}
                  >
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

      <CallDetailsDrawer
        callId={selectedCallId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}
