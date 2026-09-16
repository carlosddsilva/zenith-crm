"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CheckCircle2,
  Clock3,
  Inbox,
  Loader2,
  MessageSquarePlus,
  Phone,
  RefreshCw,
  Search,
  UserRound,
  XCircle,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type ConversationStatus =
  | "open"
  | "pending"
  | "closed";

interface ZenithTag {
  id: string;
  name: string;
  color: string;
}

interface ZenithAgent {
  user_id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
}

interface ZenithConversationContact {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  company: string | null;
  avatar_url: string | null;
  tags?: ZenithTag[];
}

interface ZenithConversation {
  id: string;
  account_id: string;
  contact_id: string;
  status: ConversationStatus;
  assigned_agent_id: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number;
  ai_autoreply_disabled: boolean;
  ai_reply_count: number;
  ai_handoff_summary: string | null;
  first_unreplied_message_at: string | null;
  sla_status: "ok" | "warning" | "overdue";
  created_at: string;
  updated_at: string;
  contact: ZenithConversationContact;
}

interface ZenithMessage {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  sender_type:
    | "customer"
    | "agent"
    | "bot";
  sender_id: string | null;
  content_type: string;
  content_text: string | null;
  media_url: string | null;
  media_type: string | null;
  template_name: string | null;
  message_id: string | null;
  status:
    | "sending"
    | "sent"
    | "delivered"
    | "read"
    | "failed";
  reply_to_message_id: string | null;
  interactive_reply_id: string | null;
  interactive_payload:
    | Record<string, unknown>
    | null;
  ai_generated: boolean;
  created_at: string;
}

interface ContactListItem {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  company: string | null;
}

interface ConversationsResponse {
  items: ZenithConversation[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

interface MessagesResponse {
  items: ZenithMessage[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

interface ContactsResponse {
  items: ContactListItem[];
}

interface InboxRealtimeEvent {
  type:
    | "message.created"
    | "message.updated"
    | "conversation.updated";

  conversationId: string;

  messageId?: string;

  occurredAt?: string;
}

const statusLabels:
  Record<ConversationStatus, string> = {
    open: "Aberta",
    pending: "Pendente",
    closed: "Fechada",
  };

function formatDateTime(
  value: string | null,
) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(date);
}

function formatMessageTime(
  value: string,
) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(date);
}

function contactLabel(
  contact: ZenithConversationContact,
) {
  return (
    contact.name?.trim() ||
    contact.phone
  );
}

function messagePreview(
  message: ZenithMessage,
) {
  if (message.content_text) {
    return message.content_text;
  }

  switch (message.content_type) {
    case "image":
      return "Imagem";
    case "audio":
      return "Áudio";
    case "video":
      return "Vídeo";
    case "document":
      return "Documento";
    case "location":
      return "Localização";
    case "template":
      return "Template";
    case "interactive":
      return "Mensagem interativa";
    default:
      return "Mensagem";
  }
}

export function ZenithInboxPage() {
  const [conversations, setConversations] =
    useState<ZenithConversation[]>([]);

  const [activeId, setActiveId] =
    useState<string | null>(null);

  const [messages, setMessages] =
    useState<ZenithMessage[]>([]);

  const [loadingConversations, setLoadingConversations] =
    useState(true);

  const [loadingMessages, setLoadingMessages] =
    useState(false);

  const [composerText, setComposerText] =
    useState("");

  const [sendingMessage, setSendingMessage] =
    useState(false);

  const [statusFilter, setStatusFilter] =
    useState<
      "all" | ConversationStatus
    >("all");

  const [slaFilter, setSlaFilter] =
    useState<
      "all" | "warning,overdue"
    >("all");

  const [search, setSearch] =
    useState("");

  const [newConversationOpen, setNewConversationOpen] =
    useState(false);

  const [contacts, setContacts] =
    useState<ContactListItem[]>([]);

  const [contactsLoading, setContactsLoading] =
    useState(false);

  const [selectedContactId, setSelectedContactId] =
    useState("");

  const [creatingConversation, setCreatingConversation] =
    useState(false);

  const [agents, setAgents] = useState<ZenithAgent[]>([]);

  const activeIdRef =
    useRef<string | null>(
      null,
    );

  const loadConversationsRealtimeRef =
    useRef<
      (
        preferredConversationId?:
          string | null,
      ) => Promise<void>
    >(async () => {});

  const loadMessagesRealtimeRef =
    useRef<
      (
        conversationId:
          string,
      ) => Promise<void>
    >(async () => {});

  const activeConversation =
    useMemo(
      () =>
        conversations.find(
          (conversation) =>
            conversation.id === activeId,
        ) ?? null,
      [
        conversations,
        activeId,
      ],
    );

  const visibleConversations =
    useMemo(() => {
      const needle =
        search
          .trim()
          .toLocaleLowerCase("pt-BR");

      if (!needle) {
        return conversations;
      }

      return conversations.filter(
        (conversation) => {
          const contact =
            conversation.contact;

          return [
            contact.name,
            contact.phone,
            contact.email,
            contact.company,
            conversation.last_message_text,
          ]
            .filter(Boolean)
            .some((value) =>
              String(value)
                .toLocaleLowerCase(
                  "pt-BR",
                )
                .includes(needle),
            );
        },
      );
    }, [
      conversations,
      search,
    ]);

  const loadConversations =
    useCallback(
      async (
        preferredConversationId?: string | null,
      ) => {
        setLoadingConversations(true);

        try {
          const params =
            new URLSearchParams({
              page: "1",
              pageSize: "100",
            });

          if (
            statusFilter !== "all"
          ) {
            params.set(
              "status",
              statusFilter,
            );
          }

          if (
            slaFilter !== "all"
          ) {
            params.set(
              "slaStatus",
              slaFilter,
            );
          }

          const response =
            await fetch(
              `/api/zenith/conversations?${params.toString()}`,
              {
                credentials:
                  "include",
                cache: "no-store",
              },
            );

          if (
            response.status ===
            401
          ) {
            window.location.href =
              "/zenith-login";
            return;
          }

          const body =
            (await response
              .json()
              .catch(
                () => null,
              )) as
              | ConversationsResponse
              | {
                  error?: string;
                }
              | null;

          if (!response.ok) {
            throw new Error(
              body &&
                "error" in body
                ? body.error
                : "Falha ao carregar conversas.",
            );
          }

          const data =
            body as ConversationsResponse;

          const items =
            data.items ?? [];

          setConversations(
            items,
          );

          const requested =
            preferredConversationId ??
            activeId;

          if (
            requested &&
            items.some(
              (item) =>
                item.id ===
                requested,
            )
          ) {
            setActiveId(
              requested,
            );
            return;
          }

          setActiveId(
            items[0]?.id ??
              null,
          );
        } catch (error) {
          console.error(
            "[ZenithInboxPage] conversations:",
            error,
          );

          toast.error(
            error instanceof Error
              ? error.message
              : "Falha ao carregar conversas.",
          );
        } finally {
          setLoadingConversations(
            false,
          );
        }
      },
      [
        activeId,
        statusFilter,
      ],
    );

  const loadMessages =
    useCallback(
      async (
        conversationId: string,
      ) => {
        setLoadingMessages(
          true,
        );

        try {
          const response =
            await fetch(
              `/api/zenith/conversations/${conversationId}/messages?page=1&pageSize=200`,
              {
                credentials:
                  "include",
                cache: "no-store",
              },
            );

          const body =
            (await response
              .json()
              .catch(
                () => null,
              )) as
              | MessagesResponse
              | {
                  error?: string;
                }
              | null;

          if (!response.ok) {
            throw new Error(
              body &&
                "error" in body
                ? body.error
                : "Falha ao carregar mensagens.",
            );
          }

          const data =
            body as MessagesResponse;

          setMessages(
            [...(data.items ?? [])]
              .reverse(),
          );
        } catch (error) {
          console.error(
            "[ZenithInboxPage] messages:",
            error,
          );

          setMessages([]);

          toast.error(
            error instanceof Error
              ? error.message
              : "Falha ao carregar mensagens.",
          );
        } finally {
          setLoadingMessages(
            false,
          );
        }
      },
      [],
    );

  const markConversationRead =
    useCallback(
      async (
        conversationId: string,
      ) => {
        const current =
          conversations.find(
            (conversation) =>
              conversation.id ===
              conversationId,
          );

        if (
          !current ||
          current.unread_count ===
            0
        ) {
          return;
        }

        try {
          const response =
            await fetch(
              `/api/zenith/conversations/${conversationId}`,
              {
                method:
                  "PATCH",
                credentials:
                  "include",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body:
                  JSON.stringify({
                    unread_count:
                      0,
                  }),
              },
            );

          if (!response.ok) {
            return;
          }

          setConversations(
            (currentItems) =>
              currentItems.map(
                (conversation) =>
                  conversation.id ===
                  conversationId
                    ? {
                        ...conversation,
                        unread_count:
                          0,
                      }
                    : conversation,
              ),
          );
        } catch {
          // Leitura é best-effort.
        }
      },
      [conversations],
    );

  const sendMessage = useCallback(async () => {
    if (!activeId || !composerText.trim() || sendingMessage) {
      return;
    }

    setSendingMessage(true);

    try {
      const response = await fetch(
        `/api/zenith/conversations/${activeId}/messages`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content_type: "text",
            content_text: composerText.trim(),
          }),
        }
      );

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          body?.error ?? "Falha ao enviar mensagem."
        );
      }

      setComposerText("");
    } catch (error) {
      console.error("[ZenithInboxPage] sendMessage error:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao enviar mensagem."
      );
    } finally {
      setSendingMessage(false);
    }
  }, [activeId, composerText, sendingMessage]);

  const updateConversationStatus = useCallback(async (newStatus: ConversationStatus) => {
    if (!activeId) return;

    try {
      const response = await fetch(`/api/zenith/conversations/${activeId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Falha ao atualizar status");
      }

      setConversations((current) =>
        current.map((c) =>
          c.id === activeId ? { ...c, status: newStatus } : c
        )
      );
      toast.success("Status atualizado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar status");
    }
  }, [activeId]);

  const updateConversationAssignment = useCallback(async (agentId: string | null) => {
    if (!activeId) return;

    try {
      const response = await fetch(`/api/zenith/conversations/${activeId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_agent_id: agentId }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Falha ao atribuir agente");
      }

      setConversations((current) =>
        current.map((c) =>
          c.id === activeId ? { ...c, assigned_agent_id: agentId } : c
        )
      );
      toast.success(agentId ? "Atribuído com sucesso" : "Atribuição removida");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atribuir agente");
    }
  }, [activeId]);

  /*
   * Mantemos as referências atuais sem
   * recriar a conexão SSE quando a thread
   * selecionada mudar.
   */
  activeIdRef.current =
    activeId;

  loadConversationsRealtimeRef.current =
    loadConversations;

  loadMessagesRealtimeRef.current =
    loadMessages;

  /*
   * Realtime da Inbox:
   *
   * Redis
   *   -> SSE
   *   -> EventSource
   *   -> refresh da lista/thread
   *
   * EventSource possui reconexão automática.
   */
  useEffect(() => {
    let disposed =
      false;

    let refreshTimer:
      ReturnType<
        typeof setTimeout
      > | null = null;

    const source =
      new EventSource(
        "/api/zenith/inbox/events",
      );

    const scheduleRefresh = (
      conversationId:
        string,
    ) => {
      /*
       * Um webhook pode gerar eventos
       * próximos entre si. Agrupamos por
       * alguns milissegundos para evitar
       * rajadas de requests.
       */
      if (refreshTimer) {
        clearTimeout(
          refreshTimer,
        );
      }

      refreshTimer =
        setTimeout(
          () => {
            refreshTimer =
              null;

            if (disposed) {
              return;
            }

            const currentActiveId =
              activeIdRef.current;

            /*
             * Atualiza preview,
             * unread_count, ordenação etc.
             */
            void loadConversationsRealtimeRef
              .current(
                currentActiveId,
              );

            /*
             * Se a mensagem pertence à
             * conversa aberta, atualiza
             * também o histórico.
             */
            if (
              currentActiveId ===
              conversationId
            ) {
              void loadMessagesRealtimeRef
                .current(
                  conversationId,
                );
            }
          },
          80,
        );
    };

    source.onmessage = (
      event,
    ) => {
      let payload:
        InboxRealtimeEvent;

      try {
        payload =
          JSON.parse(
            event.data,
          ) as InboxRealtimeEvent;
      } catch {
        console.warn(
          "[zenith inbox realtime] evento inválido",
        );

        return;
      }

      if (
        !payload ||
        typeof payload.conversationId !==
          "string"
      ) {
        return;
      }

      if (
        payload.type !==
          "message.created" &&
        payload.type !==
          "message.updated" &&
        payload.type !==
          "conversation.updated"
      ) {
        return;
      }

      scheduleRefresh(
        payload.conversationId,
      );
    };

    source.addEventListener(
      "ready",
      () => {
        console.debug(
          "[zenith inbox realtime] conectado",
        );
      },
    );

    source.onerror = () => {
      if (disposed) {
        return;
      }

      /*
       * Não fechamos aqui.
       * O EventSource fará retry
       * automaticamente.
       */
      console.debug(
        "[zenith inbox realtime] reconectando",
      );
    };

    return () => {
      disposed = true;
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      source.close();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    fetch("/api/account/members")
      .then((r) => r.json())
      .then((data) => {
        if (!disposed && data.members) {
          setAgents(data.members);
        }
      })
      .catch(console.error);
    return () => {
      disposed = true;
    };
  }, []);

  /*
  useEffect(() => {
    const params =
      new URLSearchParams(
        window.location.search,
      );

    const deepLinkId =
      params.get("c");

    void loadConversations(
      deepLinkId,
    );

    // O primeiro carregamento deve ocorrer uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
*/

  useEffect(() => {
    const params =
      new URLSearchParams(
        window.location.search,
      );

    const deepLinkId =
      params.get("c");

    void loadConversations(
      deepLinkId,
    );

    // O primeiro carregamento deve ocorrer uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      statusFilter === "all"
    ) {
      return;
    }

    void loadConversations();
    // loadConversations depende de activeId;
    // não queremos refetch ao selecionar thread.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }

    void loadMessages(
      activeId,
    );

    void markConversationRead(
      activeId,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  async function updateStatus(
    status: ConversationStatus,
  ) {
    if (!activeConversation) {
      return;
    }

    try {
      const response =
        await fetch(
          `/api/zenith/conversations/${activeConversation.id}`,
          {
            method: "PATCH",
            credentials:
              "include",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                status,
              }),
          },
        );

      const body =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        throw new Error(
          body?.error ??
            "Falha ao alterar status.",
        );
      }

      setConversations(
        (current) =>
          current.map(
            (conversation) =>
              conversation.id ===
              activeConversation.id
                ? {
                    ...conversation,
                    status,
                    updated_at:
                      body.item
                        ?.updated_at ??
                      conversation.updated_at,
                  }
                : conversation,
          ),
      );

      toast.success(
        `Conversa marcada como ${statusLabels[
          status
        ].toLocaleLowerCase(
          "pt-BR",
        )}.`,
      );

      if (
        statusFilter !==
          "all" &&
        status !==
          statusFilter
      ) {
        await loadConversations(
          null,
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao alterar status.",
      );
    }
  }

  async function openNewConversation() {
    setNewConversationOpen(
      true,
    );

    if (contacts.length > 0) {
      return;
    }

    setContactsLoading(true);

    try {
      const response =
        await fetch(
          "/api/zenith/contacts?page=1&pageSize=100",
          {
            credentials:
              "include",
            cache: "no-store",
          },
        );

      const body =
        (await response
          .json()
          .catch(
            () => null,
          )) as
          | ContactsResponse
          | {
              error?: string;
            }
          | null;

      if (!response.ok) {
        throw new Error(
          body &&
            "error" in body
            ? body.error
            : "Falha ao carregar contatos.",
        );
      }

      const data =
        body as ContactsResponse;

      setContacts(
        data.items ?? [],
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao carregar contatos.",
      );
    } finally {
      setContactsLoading(
        false,
      );
    }
  }

  async function createConversation() {
    if (!selectedContactId) {
      toast.error(
        "Selecione um contato.",
      );
      return;
    }

    setCreatingConversation(
      true,
    );

    try {
      const response =
        await fetch(
          "/api/zenith/conversations",
          {
            method: "POST",
            credentials:
              "include",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                contact_id:
                  selectedContactId,
                status: "open",
              }),
          },
        );

      const body =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        throw new Error(
          body?.error ??
            "Falha ao criar conversa.",
        );
      }

      const conversationId =
        body.item.id as string;

      setNewConversationOpen(
        false,
      );

      setSelectedContactId(
        "",
      );

      await loadConversations(
        conversationId,
      );

      toast.success(
        body.existing
          ? "Conversa existente aberta."
          : "Conversa criada.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao criar conversa.",
      );
    } finally {
      setCreatingConversation(
        false,
      );
    }
  }

  return (
    <>
      <div className="flex h-[calc(100vh-4rem)] min-h-[620px] overflow-hidden border-t border-border bg-background">
        <aside className="flex w-[340px] shrink-0 flex-col border-r border-border bg-card">
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h1 className="text-lg font-semibold">
                  Caixa de entrada
                </h1>

                <p className="text-xs text-muted-foreground">
                  Conversas do CRM
                </p>
              </div>

              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    void loadConversations()
                  }
                  title="Atualizar"
                >
                  <RefreshCw className="size-4" />
                </Button>

                <Button
                  type="button"
                  size="icon"
                  onClick={() =>
                    void openNewConversation()
                  }
                  title="Nova conversa"
                >
                  <MessageSquarePlus className="size-4" />
                </Button>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

              <Input
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value,
                  )
                }
                placeholder="Buscar conversa..."
                className="pl-9"
              />
            </div>

            <div className="grid grid-cols-4 gap-1">
              {(
                [
                  [
                    "all",
                    "Todas",
                  ],
                  [
                    "open",
                    "Abertas",
                  ],
                  [
                    "pending",
                    "Pend.",
                  ],
                  [
                    "closed",
                    "Fechadas",
                  ],
                ] as const
              ).map(
                ([
                  value,
                  label,
                ]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={
                      statusFilter ===
                      value
                        ? "default"
                        : "outline"
                    }
                    onClick={() => {
                      setStatusFilter(
                        value,
                      );

                      if (
                        value ===
                        "all"
                      ) {
                        setTimeout(
                          () => {
                            void loadConversations();
                          },
                          0,
                        );
                      }
                    }}
                    className="px-2 text-xs"
                  >
                    {label}
                  </Button>
                ),
              )}
            </div>

            <div className="mt-1 flex gap-1">
              <Button
                type="button"
                size="sm"
                variant={slaFilter === "all" ? "default" : "outline"}
                onClick={() => {
                  setSlaFilter("all");
                  setTimeout(() => void loadConversations(), 0);
                }}
                className="flex-1 text-xs"
              >
                SLA: Todos
              </Button>
              <Button
                type="button"
                size="sm"
                variant={slaFilter === "warning,overdue" ? "destructive" : "outline"}
                onClick={() => {
                  setSlaFilter("warning,overdue");
                  setTimeout(() => void loadConversations(), 0);
                }}
                className="flex-1 text-xs"
              >
                SLA: Atrasados
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingConversations ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Carregando...
              </div>
            ) : visibleConversations.length ===
              0 ? (
              <div className="px-6 py-12 text-center">
                <Inbox className="mx-auto mb-3 size-8 text-muted-foreground" />

                <p className="text-sm font-medium">
                  Nenhuma conversa
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Inicie uma conversa a partir de um contato.
                </p>
              </div>
            ) : (
              visibleConversations.map(
                (conversation) => {
                  const active =
                    activeId ===
                    conversation.id;

                  return (
                    <button
                      key={
                        conversation.id
                      }
                      type="button"
                      onClick={() =>
                        setActiveId(
                          conversation.id,
                        )
                      }
                      className={[
                        "w-full border-b border-border px-4 py-3 text-left transition-colors",
                        active
                          ? "bg-accent"
                          : "hover:bg-muted/60",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {contactLabel(
                                conversation.contact,
                              )}
                            </span>

                            {conversation.unread_count >
                              0 && (
                              <span className="flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                                {
                                  conversation.unread_count
                                }
                              </span>
                            )}
                          </div>

                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {conversation.last_message_text ??
                              "Sem mensagens"}
                          </p>
                        </div>

                        <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                          {formatDateTime(
                            conversation.last_message_at,
                          )}
                        </span>
                      </div>

                      {conversation.sla_status !== "ok" && (
                        <div className="mt-1 flex items-center gap-1">
                          <Badge variant={conversation.sla_status === "overdue" ? "destructive" : "secondary"} className="px-1 py-0 text-[9px] h-4">
                            SLA {conversation.sla_status === "overdue" ? "Estourado" : "Alerta"}
                          </Badge>
                        </div>
                      )}
                    </button>
                  );
                },
              )
            )}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {!activeConversation ? (
            <div className="flex flex-1 items-center justify-center bg-[url('/inbox-doodle.svg')] bg-repeat">
              <div className="max-w-sm rounded-xl border border-border bg-background/90 p-8 text-center shadow-sm backdrop-blur">
                <Inbox className="mx-auto mb-4 size-10 text-muted-foreground" />

                <h2 className="font-semibold">
                  Selecione uma conversa
                </h2>

                <p className="mt-2 text-sm text-muted-foreground">
                  Escolha uma conversa na lista para visualizar o histórico.
                </p>
              </div>
            </div>
          ) : (
            <>
              <header className="flex min-h-16 items-center justify-between gap-4 border-b border-border bg-card px-5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-semibold">
                      {contactLabel(
                        activeConversation.contact,
                      )}
                    </h2>
                    {activeConversation.sla_status !== "ok" && (
                      <Badge variant={activeConversation.sla_status === "overdue" ? "destructive" : "secondary"} className="h-5 px-1.5 text-[10px]">
                        SLA {activeConversation.sla_status === "overdue" ? "Estourado" : "Alerta"}
                      </Badge>
                    )}
                  </div>

                  <p className="truncate text-xs text-muted-foreground">
                    {
                      activeConversation.contact
                        .phone
                    }
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={
                      activeConversation.status
                    }
                    onChange={(event) =>
                      void updateStatus(
                        event.target
                          .value as ConversationStatus,
                      )
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="open">
                      Aberta
                    </option>

                    <option value="pending">
                      Pendente
                    </option>

                    <option value="closed">
                      Fechada
                    </option>
                  </select>

                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      void loadMessages(
                        activeConversation.id,
                      )
                    }
                    title="Atualizar mensagens"
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto bg-[url('/inbox-doodle.svg')] bg-repeat p-5">
                {loadingMessages ? (
                  <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Carregando mensagens...
                  </div>
                ) : messages.length ===
                  0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="rounded-xl border border-border bg-background/90 px-8 py-6 text-center shadow-sm">
                      <p className="text-sm font-medium">
                        Nenhuma mensagem nesta conversa
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        O transporte WhatsApp será conectado na próxima etapa.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto flex max-w-4xl flex-col gap-3">
                    {messages.map(
                      (message) => {
                        const outbound =
                          message.direction ===
                          "outbound";

                        return (
                          <div
                            key={
                              message.id
                            }
                            className={[
                              "flex",
                              outbound
                                ? "justify-end"
                                : "justify-start",
                            ].join(
                              " ",
                            )}
                          >
                            <div
                              className={[
                                "max-w-[75%] rounded-xl border px-3 py-2 shadow-sm",
                                outbound
                                  ? "border-primary/20 bg-primary/10"
                                  : "border-border bg-card",
                              ].join(
                                " ",
                              )}
                            >
                              <p className="whitespace-pre-wrap break-words text-sm">
                                {messagePreview(
                                  message,
                                )}
                              </p>

                              <div className="mt-1 flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
                                {message.ai_generated && (
                                  <span>
                                    IA
                                  </span>
                                )}

                                <span>
                                  {formatMessageTime(
                                    message.created_at,
                                  )}
                                </span>

                                {outbound && (
                                  <span>
                                    {
                                      message.status
                                    }
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                )}
              </div>

              <footer className="border-t border-border bg-card p-4">
                <form
                  className="mx-auto flex max-w-4xl items-end gap-3 rounded-lg border border-border bg-background p-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendMessage();
                  }}
                >
                  <Input
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    placeholder="Digite uma mensagem..."
                    className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
                    disabled={sendingMessage || activeConversation?.status === "closed"}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!composerText.trim() || sendingMessage || activeConversation?.status === "closed"}
                  >
                    {sendingMessage ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Enviar"
                    )}
                  </Button>
                </form>
              </footer>
            </>
          )}
        </main>

        {activeConversation && (
          <aside className="hidden w-[300px] shrink-0 border-l border-border bg-card xl:block">
            <div className="border-b border-border p-5 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted">
                <UserRound className="size-6 text-muted-foreground" />
              </div>

              <h3 className="mt-3 font-semibold">
                {contactLabel(
                  activeConversation.contact,
                )}
              </h3>

              <p className="mt-1 text-xs text-muted-foreground">
                {
                  activeConversation.contact
                    .phone
                }
              </p>
            </div>

            <div className="space-y-5 p-5">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Contato
                </p>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Phone className="size-4 shrink-0 text-muted-foreground" />

                      <span className="truncate">
                        {
                          activeConversation.contact
                            .phone
                        }
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        window.dispatchEvent(
                          new CustomEvent(
                            "zenith:voice-dialer:open",
                            {
                              detail: {
                                phone:
                                  activeConversation.contact
                                    .phone,

                                contactId:
                                  activeConversation.contact
                                    .id,
                              },
                            },
                          ),
                        );
                      }}
                      aria-label={`Ligar para ${contactLabel(
                        activeConversation.contact,
                      )}`}
                      title="Ligar"
                      className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      <Phone className="size-3.5" />
                      Ligar
                    </button>
                  </div>

                  {activeConversation.contact
                    .email && (
                    <p className="break-all text-xs text-muted-foreground">
                      {
                        activeConversation.contact
                          .email
                      }
                    </p>
                  )}

                  {activeConversation.contact
                    .company && (
                    <p className="text-xs text-muted-foreground">
                      {
                        activeConversation.contact
                          .company
                      }
                    </p>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Status
                </p>

                <DropdownMenu>
                  <DropdownMenuTrigger className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted">
                    <div className="flex items-center gap-2">
                      {activeConversation.status === "open" && (
                        <CheckCircle2 className="size-4 text-emerald-500" />
                      )}

                      {activeConversation.status === "pending" && (
                        <Clock3 className="size-4 text-amber-500" />
                      )}

                      {activeConversation.status === "closed" && (
                        <XCircle className="size-4 text-muted-foreground" />
                      )}

                      <span>
                        {statusLabels[activeConversation.status]}
                      </span>
                    </div>
                    <ChevronDown className="size-4 text-muted-foreground" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[260px]">
                    {(["open", "pending", "closed"] as ConversationStatus[]).map((status) => (
                      <DropdownMenuItem
                        key={status}
                        onClick={() => void updateConversationStatus(status)}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        {status === "open" && <CheckCircle2 className="size-4 text-emerald-500" />}
                        {status === "pending" && <Clock3 className="size-4 text-amber-500" />}
                        {status === "closed" && <XCircle className="size-4 text-muted-foreground" />}
                        <span>{statusLabels[status]}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="mt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Atribuição
                </p>

                <DropdownMenu>
                  <DropdownMenuTrigger className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted">
                    <span className="truncate">
                      {activeConversation.assigned_agent_id
                        ? agents.find(a => a.user_id === activeConversation.assigned_agent_id)?.full_name || "Agente Desconhecido"
                        : "Não atribuído"}
                    </span>
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[260px]">
                    <DropdownMenuItem
                      onClick={() => void updateConversationAssignment(null)}
                      className="cursor-pointer"
                    >
                      Não atribuído
                    </DropdownMenuItem>
                    {agents.map((agent) => (
                      <DropdownMenuItem
                        key={agent.user_id}
                        onClick={() => void updateConversationAssignment(agent.user_id)}
                        className="cursor-pointer"
                      >
                        {agent.full_name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="mt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Tags
                </p>

                <div className="flex flex-wrap gap-2">
                  {activeConversation.contact
                    .tags?.length ? (
                    activeConversation.contact.tags.map(
                      (tag) => (
                        <Badge
                          key={
                            tag.id
                          }
                          variant="outline"
                          style={{
                            borderColor:
                              tag.color,
                          }}
                        >
                          {
                            tag.name
                          }
                        </Badge>
                      ),
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Nenhuma tag
                    </span>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Automação
                </p>

                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>
                    Respostas IA:{" "}
                    {activeConversation.ai_autoreply_disabled
                      ? "desativadas"
                      : "permitidas"}
                  </p>

                  <p>
                    Respostas IA registradas:{" "}
                    {
                      activeConversation.ai_reply_count
                    }
                  </p>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      <Dialog
        open={
          newConversationOpen
        }
        onOpenChange={
          setNewConversationOpen
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Nova conversa
            </DialogTitle>

            <DialogDescription>
              Selecione um contato existente. Se ele já possuir uma conversa, a conversa existente será aberta.
            </DialogDescription>
          </DialogHeader>

          {contactsLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Carregando contatos...
            </div>
          ) : (
            <select
              value={
                selectedContactId
              }
              onChange={(event) =>
                setSelectedContactId(
                  event.target.value,
                )
              }
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">
                Selecione um contato...
              </option>

              {contacts.map(
                (contact) => (
                  <option
                    key={
                      contact.id
                    }
                    value={
                      contact.id
                    }
                  >
                    {contact.name ??
                      contact.phone}{" "}
                    —{" "}
                    {contact.phone}
                  </option>
                ),
              )}
            </select>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setNewConversationOpen(
                  false,
                )
              }
            >
              Cancelar
            </Button>

            <Button
              type="button"
              disabled={
                !selectedContactId ||
                creatingConversation
              }
              onClick={() =>
                void createConversation()
              }
            >
              {creatingConversation ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Abrindo...
                </>
              ) : (
                "Abrir conversa"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

