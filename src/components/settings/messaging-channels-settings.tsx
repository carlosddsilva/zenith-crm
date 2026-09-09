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

type Provider =
  | "meta"
  | "evolution";

interface MessagingChannel {
  id: string;
  name: string;

  provider:
    Provider;

  config: {
    phone_number_id?:
      string | null;

    base_url?:
      string | null;

    instance_name?:
      string | null;
  };

  is_active:
    boolean;

  is_default_service:
    boolean;

  has_credentials:
    boolean;

  created_at:
    string;

  updated_at:
    string;
}

interface ChannelForm {
  name: string;

  provider:
    Provider;

  phoneNumberId:
    string;

  accessToken:
    string;

  baseUrl:
    string;

  instanceName:
    string;

  apiKey:
    string;

  isActive:
    boolean;

  isDefault:
    boolean;
}

const emptyForm:
  ChannelForm = {
  name: "",
  provider: "evolution",

  phoneNumberId: "",
  accessToken: "",

  baseUrl: "",
  instanceName: "",
  apiKey: "",

  isActive: true,
  isDefault: false,
};

function providerLabel(
  provider: Provider,
) {
  return provider === "meta"
    ? "Meta Cloud API"
    : "Evolution API";
}

export function MessagingChannelsSettings() {
  const [channels, setChannels] =
    useState<MessagingChannel[]>([]);

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
    useState<MessagingChannel | null>(
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
            "/api/zenith/messaging-channels",
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
          await response
            .json()
            .catch(() => null);

        if (!response.ok) {
          throw new Error(
            body?.error ??
              "Falha ao carregar canais.",
          );
        }

        setChannels(
          body.items ?? [],
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Falha ao carregar canais.",
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
    channel: MessagingChannel,
  ) {
    setEditing(channel);

    setForm({
      name:
        channel.name,

      provider:
        channel.provider,

      phoneNumberId:
        channel.config
          .phone_number_id ??
        "",

      accessToken:
        "",

      baseUrl:
        channel.config
          .base_url ??
        "",

      instanceName:
        channel.config
          .instance_name ??
        "",

      apiKey:
        "",

      isActive:
        channel.is_active,

      isDefault:
        channel.is_default_service,
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

    if (
      form.isDefault &&
      !form.isActive
    ) {
      toast.error(
        "O canal padrão precisa estar ativo.",
      );

      return;
    }

    if (
      form.provider ===
      "meta"
    ) {
      if (
        !form.phoneNumberId.trim()
      ) {
        toast.error(
          "Informe o Phone Number ID da Meta.",
        );

        return;
      }

      if (
        !editing &&
        !form.accessToken.trim()
      ) {
        toast.error(
          "Informe o Access Token da Meta.",
        );

        return;
      }
    } else {
      if (
        !form.baseUrl.trim() ||
        !form.instanceName.trim()
      ) {
        toast.error(
          "Informe URL e instância da Evolution.",
        );

        return;
      }

      if (
        !editing &&
        !form.apiKey.trim()
      ) {
        toast.error(
          "Informe a API Key da Evolution.",
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

        is_default_service:
          form.isDefault,
      };

      if (!editing) {
        payload.provider =
          form.provider;
      }

      if (
        form.provider ===
        "meta"
      ) {
        payload.config = {
          phone_number_id:
            form.phoneNumberId.trim(),
        };

        if (
          form.accessToken.trim()
        ) {
          payload.credentials = {
            access_token:
              form.accessToken.trim(),
          };
        }
      } else {
        payload.config = {
          base_url:
            form.baseUrl.trim(),

          instance_name:
            form.instanceName.trim(),
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

      const url =
        editing
          ? `/api/zenith/messaging-channels/${editing.id}`
          : "/api/zenith/messaging-channels";

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
            "Falha ao salvar canal.",
        );
      }

      toast.success(
        editing
          ? "Canal atualizado."
          : "Canal criado.",
      );

      setDialogOpen(false);

      await loadChannels();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao salvar canal.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(
    channel: MessagingChannel,
  ) {
    if (
      channel.is_default_service
    ) {
      return;
    }

    setBusyId(
      channel.id,
    );

    try {
      const response =
        await fetch(
          `/api/zenith/messaging-channels/${channel.id}`,
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

                is_default_service:
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
            "Falha ao definir canal padrão.",
        );
      }

      toast.success(
        `${channel.name} definido como canal padrão.`,
      );

      await loadChannels();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao definir canal padrão.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function remove(
    channel: MessagingChannel,
  ) {
    const confirmed =
      window.confirm(
        `Excluir o canal "${channel.name}"?`,
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
          `/api/zenith/messaging-channels/${channel.id}`,
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
            "Falha ao excluir canal.",
        );
      }

      toast.success(
        "Canal excluído.",
      );

      await loadChannels();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao excluir canal.",
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
            Canais WhatsApp
          </h2>

          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Configure os canais utilizados pela Inbox. Meta Cloud API e Evolution API permanecem isolados por provider.
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
              Access Tokens e API Keys são armazenados criptografados com AES-256-GCM e nunca são retornados pela API.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-border py-14 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Carregando canais...
        </div>
      ) : channels.length ===
        0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-14 text-center">
          <Server className="mx-auto size-9 text-muted-foreground" />

          <h3 className="mt-3 font-medium">
            Nenhum canal configurado
          </h3>

          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre Meta Cloud API ou Evolution API para posteriormente habilitar o envio da Inbox.
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

                      {channel.is_default_service && (
                        <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          <Star className="size-3" />
                          Padrão
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
                    </div>

                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {channel.provider ===
                      "meta" ? (
                        <p>
                          Phone Number ID:{" "}
                          {channel.config
                            .phone_number_id ??
                            "—"}
                        </p>
                      ) : (
                        <>
                          <p>
                            URL:{" "}
                            {channel.config
                              .base_url ??
                              "—"}
                          </p>

                          <p>
                            Instância:{" "}
                            {channel.config
                              .instance_name ??
                              "—"}
                          </p>
                        </>
                      )}

                      <p>
                        Credencial:{" "}
                        {channel.has_credentials
                          ? "armazenada"
                          : "não configurada"}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {!channel.is_default_service && (
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
                        Tornar padrão
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
                ? "Editar canal"
                : "Novo canal"}
            </DialogTitle>

            <DialogDescription>
              Configure o transporte utilizado para atendimento via WhatsApp.
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
                placeholder="Ex.: WhatsApp Atendimento"
              />
            </div>

            <div className="space-y-2">
              <Label>
                Provider
              </Label>

              <select
                value={
                  form.provider
                }
                disabled={
                  Boolean(
                    editing,
                  )
                }
                onChange={(event) =>
                  updateForm(
                    "provider",
                    event.target
                      .value as Provider,
                  )
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="evolution">
                  Evolution API
                </option>

                <option value="meta">
                  Meta Cloud API
                </option>
              </select>

              {editing && (
                <p className="text-xs text-muted-foreground">
                  O provider de um canal existente não pode ser alterado. Crie outro canal se necessário.
                </p>
              )}
            </div>

            {form.provider ===
            "meta" ? (
              <>
                <div className="space-y-2">
                  <Label>
                    Phone Number ID
                  </Label>

                  <Input
                    value={
                      form.phoneNumberId
                    }
                    onChange={(event) =>
                      updateForm(
                        "phoneNumberId",
                        event.target.value,
                      )
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>
                    Access Token
                  </Label>

                  <Input
                    type="password"
                    value={
                      form.accessToken
                    }
                    onChange={(event) =>
                      updateForm(
                        "accessToken",
                        event.target.value,
                      )
                    }
                    placeholder={
                      editing
                        ? "Deixe vazio para manter o atual"
                        : "Token da Meta"
                    }
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>
                    URL da Evolution API
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
                    placeholder="https://evolution.exemplo.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label>
                    Nome da instância
                  </Label>

                  <Input
                    value={
                      form.instanceName
                    }
                    onChange={(event) =>
                      updateForm(
                        "instanceName",
                        event.target.value,
                      )
                    }
                    placeholder="atendimento"
                  />
                </div>

                <div className="space-y-2">
                  <Label>
                    API Key
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
                      editing
                        ? "Deixe vazio para manter a atual"
                        : "API Key da Evolution"
                    }
                  />
                </div>
              </>
            )}

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
                  Somente canais ativos poderão ser usados pelo dispatcher.
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
                  Canal padrão de atendimento
                </p>

                <p className="text-xs text-muted-foreground">
                  A Inbox utilizará este canal quando nenhuma seleção específica existir.
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
