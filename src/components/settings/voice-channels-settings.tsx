"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  CheckCircle2,
  KeyRound,
  Loader2,
  Pencil,
  PhoneCall,
  Plus,
  Server,
  Star,
  Trash2,
} from "lucide-react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type VoiceProvider =
  | "wacalls"
  | "asterisk";

type VoiceHealth =
  | "unknown"
  | "online"
  | "degraded"
  | "offline";

interface VoiceChannelConfig {
  baseUrl?: string | null;
  sessionId?: string | null;

  /*
   * Compatibilidade defensiva caso alguma
   * resposta antiga tenha exposto snake_case.
   */
  base_url?: string | null;
  session_id?: string | null;

  [key: string]:
    | string
    | number
    | boolean
    | null
    | undefined;
}

interface VoiceChannel {
  id: string;
  name: string;
  provider: VoiceProvider;

  config: VoiceChannelConfig;

  is_active: boolean;
  is_default: boolean;

  allow_inbound: boolean;
  allow_outbound: boolean;

  priority: number;
  max_concurrent_calls: number;

  health_status: VoiceHealth;

  has_credentials: boolean;

  created_at?: string;
  updated_at?: string;
}

interface ChannelForm {
  name: string;
  provider: VoiceProvider;

  baseUrl: string;
  sessionId: string;
  apiKey: string;

  isActive: boolean;
  isDefault: boolean;

  allowInbound: boolean;
  allowOutbound: boolean;

  priority: string;
  maxConcurrentCalls: string;
}

const emptyForm: ChannelForm = {
  name: "",
  provider: "wacalls",

  baseUrl: "",
  sessionId: "",
  apiKey: "",

  isActive: true,
  isDefault: false,

  allowInbound: true,
  allowOutbound: true,

  priority: "100",
  maxConcurrentCalls: "1",
};

function providerLabel(
  provider: VoiceProvider,
) {
  return provider === "wacalls"
    ? "WaCalls"
    : "Asterisk";
}

function getBaseUrl(
  channel: VoiceChannel,
) {
  return (
    channel.config.baseUrl ??
    channel.config.base_url ??
    ""
  );
}

function getSessionId(
  channel: VoiceChannel,
) {
  return (
    channel.config.sessionId ??
    channel.config.session_id ??
    ""
  );
}

function healthLabel(
  health: VoiceHealth,
) {
  switch (health) {
    case "online":
      return "Online";

    case "degraded":
      return "Degradado";

    case "offline":
      return "Offline";

    default:
      return "Desconhecido";
  }
}

function healthClass(
  health: VoiceHealth,
) {
  switch (health) {
    case "online":
      return "text-emerald-600";

    case "degraded":
      return "text-amber-600";

    case "offline":
      return "text-red-600";

    default:
      return "text-muted-foreground";
  }
}

export function VoiceChannelsSettings() {
  const [channels, setChannels] =
    useState<VoiceChannel[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [dialogOpen, setDialogOpen] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [busyId, setBusyId] =
    useState<string | null>(
      null,
    );

  const [editing, setEditing] =
    useState<VoiceChannel | null>(
      null,
    );

  const [form, setForm] =
    useState<ChannelForm>(
      emptyForm,
    );

  const loadChannels =
    useCallback(async () => {
      setLoading(true);

      try {
        const response =
          await fetch(
            "/api/zenith/voice-channels",
            {
              credentials:
                "include",
              cache:
                "no-store",
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
          await response
            .json()
            .catch(() => null);

        if (!response.ok) {
          throw new Error(
            body?.error ??
              "Falha ao carregar canais de voz.",
          );
        }

        setChannels(
          body?.items ??
            [],
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Falha ao carregar canais de voz.",
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  function updateForm<
    K extends keyof ChannelForm,
  >(
    key: K,
    value: ChannelForm[K],
  ) {
    setForm(
      (current) => ({
        ...current,
        [key]: value,
      }),
    );
  }

  function openCreate() {
    setEditing(null);

    setForm({
      ...emptyForm,

      isDefault:
        channels.length === 0,
    });

    setDialogOpen(true);
  }

  function openEdit(
    channel: VoiceChannel,
  ) {
    setEditing(channel);

    setForm({
      name:
        channel.name,

      provider:
        channel.provider,

      baseUrl:
        getBaseUrl(
          channel,
        ),

      sessionId:
        getSessionId(
          channel,
        ),

      apiKey:
        "",

      isActive:
        channel.is_active,

      isDefault:
        channel.is_default,

      allowInbound:
        channel.allow_inbound,

      allowOutbound:
        channel.allow_outbound,

      priority:
        String(
          channel.priority,
        ),

      maxConcurrentCalls:
        String(
          channel.max_concurrent_calls,
        ),
    });

    setDialogOpen(true);
  }

  async function save() {
    const name =
      form.name.trim();

    if (!name) {
      toast.error(
        "Informe o nome do canal.",
      );

      return;
    }

    const priority =
      Number(
        form.priority,
      );

    if (
      !Number.isInteger(
        priority,
      ) ||
      priority < 0
    ) {
      toast.error(
        "A prioridade precisa ser um número inteiro maior ou igual a zero.",
      );

      return;
    }

    const maxConcurrentCalls =
      Number(
        form.maxConcurrentCalls,
      );

    if (
      !Number.isInteger(
        maxConcurrentCalls,
      ) ||
      maxConcurrentCalls < 1
    ) {
      toast.error(
        "Chamadas simultâneas precisa ser um número inteiro maior ou igual a 1.",
      );

      return;
    }

    if (
      form.isDefault &&
      !form.isActive
    ) {
      toast.error(
        "O canal preferencial precisa estar ativo.",
      );

      return;
    }

    if (
      !form.allowInbound &&
      !form.allowOutbound
    ) {
      toast.error(
        "Habilite entrada, saída ou ambas.",
      );

      return;
    }

    if (
      form.provider ===
      "wacalls"
    ) {
      if (
        !form.baseUrl.trim() ||
        !form.sessionId.trim()
      ) {
        toast.error(
          "Informe a URL do Gateway e o Session ID.",
        );

        return;
      }


    }

    setSaving(true);

    try {
      const payload:
        Record<string, unknown> = {
        name,

        is_active:
          form.isActive,

        is_default:
          form.isDefault,

        allow_inbound:
          form.allowInbound,

        allow_outbound:
          form.allowOutbound,

        priority,

        max_concurrent_calls:
          maxConcurrentCalls,
      };

      if (!editing) {
        payload.provider =
          form.provider;
      }

      if (
        form.provider ===
        "wacalls"
      ) {
        payload.config = {
          base_url:
            form.baseUrl.trim(),

          session_id:
            form.sessionId.trim(),
        };

        if (
          form.apiKey.trim()
        ) {
          payload.credentials = {
            api_key:
              form.apiKey.trim(),
          };
        }
      }

      /*
       * Para Asterisk existente permitimos
       * alterar somente propriedades comuns.
       *
       * Campos ARI não são enviados até o
       * contrato específico estar confirmado
       * no backend.
       */
      const url =
        editing
          ? `/api/zenith/voice-channels/${editing.id}`
          : "/api/zenith/voice-channels";

      const response =
        await fetch(
          url,
          {
            method:
              editing
                ? "PATCH"
                : "POST",

            credentials:
              "include",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                payload,
              ),
          },
        );

      const body =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        throw new Error(
          body?.error ??
            "Falha ao salvar canal de voz.",
        );
      }

      toast.success(
        editing
          ? "Canal de voz atualizado."
          : "Canal de voz criado.",
      );

      setDialogOpen(false);

      await loadChannels();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao salvar canal de voz.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(
    channel: VoiceChannel,
  ) {
    if (
      channel.is_default
    ) {
      return;
    }

    setBusyId(
      channel.id,
    );

    try {
      const response =
        await fetch(
          `/api/zenith/voice-channels/${channel.id}`,
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
                is_active:
                  true,

                is_default:
                  true,
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
            "Falha ao definir canal preferencial.",
        );
      }

      toast.success(
        `${channel.name} definido como canal preferencial.`,
      );

      await loadChannels();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao definir canal preferencial.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function remove(
    channel: VoiceChannel,
  ) {
    const confirmed =
      window.confirm(
        `Excluir o canal de voz "${channel.name}"?`,
      );

    if (!confirmed) {
      return;
    }

    setBusyId(
      channel.id,
    );

    try {
      const response =
        await fetch(
          `/api/zenith/voice-channels/${channel.id}`,
          {
            method:
              "DELETE",

            credentials:
              "include",
          },
        );

      const body =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        throw new Error(
          body?.error ??
            "Falha ao excluir canal de voz.",
        );
      }

      toast.success(
        "Canal de voz excluído.",
      );

      await loadChannels();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao excluir canal de voz.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            Zenith Calls
          </h2>

          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Gerencie os canais de voz do Zenith Calls, chamadas e fluxos IVR.
          </p>
        </div>

        <Button
          type="button"
          onClick={
            openCreate
          }
        >
          <Plus className="mr-2 size-4" />
          Novo canal
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex gap-3">
          <KeyRound className="mt-0.5 size-5 shrink-0 text-muted-foreground" />

          <div>
            <p className="text-sm font-medium">
              Credenciais protegidas
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              API Keys são armazenadas criptografadas e nunca
              são exibidas novamente pela interface.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-border py-14 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Carregando canais de voz...
        </div>
      ) : channels.length ===
        0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-14 text-center">
          <PhoneCall className="mx-auto size-9 text-muted-foreground" />

          <h3 className="mt-3 font-medium">
            Nenhum canal de voz configurado
          </h3>

          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre um canal WaCalls para habilitar
            chamadas WhatsApp Voice e execução de IVR.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {channels.map(
            (channel) => (
              <div
                key={
                  channel.id
                }
                className="rounded-lg border border-border bg-card p-5"
              >
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">
                        {
                          channel.name
                        }
                      </h3>

                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs">
                        {providerLabel(
                          channel.provider,
                        )}
                      </span>

                      {channel.is_default && (
                        <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          <Star className="size-3" />
                          Preferencial
                        </span>
                      )}

                      {channel.is_active ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-600">
                          <CheckCircle2 className="size-3" />
                          Ativo
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Inativo
                        </span>
                      )}

                      <span
                        className={`text-xs ${healthClass(
                          channel.health_status,
                        )}`}
                      >
                        {healthLabel(
                          channel.health_status,
                        )}
                      </span>
                    </div>

                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {channel.provider ===
                      "wacalls" ? (
                        <>
                          <p>
                            URL do WaCalls:{" "}
                            {getBaseUrl(
                              channel,
                            ) || "—"}
                          </p>

                          <p>
                            Session ID:{" "}
                            {getSessionId(
                              channel,
                            ) || "—"}
                          </p>
                        </>
                      ) : (
                        <p>
                          Configuração ARI gerenciada pelo provider
                          Asterisk.
                        </p>
                      )}

                      <p>
                        Direções:{" "}
                        {channel.allow_inbound
                          ? "Entrada"
                          : ""}
                        {channel.allow_inbound &&
                        channel.allow_outbound
                          ? " + "
                          : ""}
                        {channel.allow_outbound
                          ? "Saída"
                          : ""}
                      </p>

                      <p>
                        Prioridade:{" "}
                        {channel.priority}
                        {" · "}
                        Simultâneas:{" "}
                        {
                          channel.max_concurrent_calls
                        }
                      </p>

                      <p>
                        Credencial:{" "}
                        {channel.has_credentials
                          ? "armazenada"
                          : "não configurada"}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {!channel.is_default && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={
                          busyId ===
                          channel.id
                        }
                        onClick={() =>
                          void setDefault(
                            channel,
                          )
                        }
                      >
                        <Star className="mr-2 size-4" />
                        Preferencial
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={
                        busyId ===
                        channel.id
                      }
                      onClick={() =>
                        openEdit(
                          channel,
                        )
                      }
                      title="Editar canal"
                    >
                      <Pencil className="size-4" />
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={
                        busyId ===
                        channel.id
                      }
                      onClick={() =>
                        void remove(
                          channel,
                        )
                      }
                      title="Excluir canal"
                    >
                      {busyId ===
                      channel.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      <Dialog
        open={
          dialogOpen
        }
        onOpenChange={
          setDialogOpen
        }
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? "Editar canal de voz"
                : "Novo canal de voz"}
            </DialogTitle>

            <DialogDescription>
              Configure o provider utilizado para chamadas e IVR.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label>
                Nome do canal
              </Label>

              <Input
                value={
                  form.name
                }
                onChange={(event) =>
                  updateForm(
                    "name",
                    event.target.value,
                  )
                }
                placeholder="Ex.: WhatsApp Voice Principal"
              />
            </div>

            <div className="space-y-2">
              <Label>
                Provider
              </Label>

              <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm">
                {providerLabel(
                  form.provider,
                )}
              </div>

              {!editing && (
                <p className="text-xs text-muted-foreground">
                  Novos canais desta tela utilizam o WaCalls.
                  Suporte de configuração ARI será tratado
                  separadamente.
                </p>
              )}
            </div>

            {form.provider ===
            "wacalls" ? (
              <>
                <div className="space-y-2">
                  <Label>
                    URL do WaCalls
                  </Label>

                  <Input
                    value={
                      form.baseUrl
                    }
                    onChange={(event) =>
                      updateForm(
                        "baseUrl",
                        event.target.value,
                      )
                    }
                    placeholder="https://voice.exemplo.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label>
                    Session ID
                  </Label>

                  <Input
                    value={
                      form.sessionId
                    }
                    onChange={(event) =>
                      updateForm(
                        "sessionId",
                        event.target.value,
                      )
                    }
                    placeholder="zenith-voice-01"
                  />
                </div>

                <div className="space-y-2">
                  <Label>
                    API Key (opcional)
                  </Label>

                  <Input
                    type="password"
                    value={
                      form.apiKey
                    }
                    onChange={(event) =>
                      updateForm(
                        "apiKey",
                        event.target.value,
                      )
                    }
                    placeholder={
                      editing &&
                      editing.has_credentials
                        ? "Deixe vazio para manter a atual"
                        : "API Key do WaCalls (opcional)"
                    }
                  />
                </div>
              </>
            ) : (
              <div className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">
                Os parâmetros ARI deste canal Asterisk não serão
                alterados por esta tela. Apenas propriedades comuns
                do canal podem ser editadas.
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  Prioridade
                </Label>

                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={
                    form.priority
                  }
                  onChange={(event) =>
                    updateForm(
                      "priority",
                      event.target.value,
                    )
                  }
                />

                <p className="text-xs text-muted-foreground">
                  Menor número = maior prioridade.
                </p>
              </div>

              <div className="space-y-2">
                <Label>
                  Chamadas simultâneas
                </Label>

                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={
                    form.maxConcurrentCalls
                  }
                  onChange={(event) =>
                    updateForm(
                      "maxConcurrentCalls",
                      event.target.value,
                    )
                  }
                />
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-md border border-border p-3">
              <input
                type="checkbox"
                checked={
                  form.allowInbound
                }
                onChange={(event) =>
                  updateForm(
                    "allowInbound",
                    event.target.checked,
                  )
                }
                className="mt-1"
              />

              <div>
                <p className="text-sm font-medium">
                  Chamadas de entrada
                </p>

                <p className="text-xs text-muted-foreground">
                  Permite receber chamadas inbound e iniciar
                  fluxos IVR vinculados ao canal.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 rounded-md border border-border p-3">
              <input
                type="checkbox"
                checked={
                  form.allowOutbound
                }
                onChange={(event) =>
                  updateForm(
                    "allowOutbound",
                    event.target.checked,
                  )
                }
                className="mt-1"
              />

              <div>
                <p className="text-sm font-medium">
                  Chamadas de saída
                </p>

                <p className="text-xs text-muted-foreground">
                  Permite que o dispatcher selecione este canal
                  para chamadas outbound.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 rounded-md border border-border p-3">
              <input
                type="checkbox"
                checked={
                  form.isActive
                }
                onChange={(event) => {
                  const active =
                    event.target.checked;

                  updateForm(
                    "isActive",
                    active,
                  );

                  if (!active) {
                    updateForm(
                      "isDefault",
                      false,
                    );
                  }
                }}
                className="mt-1"
              />

              <div>
                <p className="text-sm font-medium">
                  Canal ativo
                </p>

                <p className="text-xs text-muted-foreground">
                  Somente canais ativos participam do roteamento.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 rounded-md border border-border p-3">
              <input
                type="checkbox"
                checked={
                  form.isDefault
                }
                onChange={(event) => {
                  const value =
                    event.target.checked;

                  updateForm(
                    "isDefault",
                    value,
                  );

                  if (value) {
                    updateForm(
                      "isActive",
                      true,
                    );
                  }
                }}
                className="mt-1"
              />

              <div>
                <p className="text-sm font-medium">
                  Canal preferencial
                </p>

                <p className="text-xs text-muted-foreground">
                  Será priorizado quando nenhuma seleção específica
                  de canal existir.
                </p>
              </div>
            </label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={
                saving
              }
              onClick={() =>
                setDialogOpen(
                  false,
                )
              }
            >
              Cancelar
            </Button>

            <Button
              type="button"
              disabled={
                saving
              }
              onClick={() =>
                void save()
              }
            >
              {saving && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}

              {editing
                ? "Salvar alterações"
                : "Criar canal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
