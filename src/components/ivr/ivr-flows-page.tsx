"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  Activity,
  FileEdit,
  Loader2,
  Plus,
  RefreshCw,
  Workflow,
} from "lucide-react";

import {
  useRouter,
} from "next/navigation";

import {
  toast,
} from "sonner";

import {
  Badge,
} from "@/components/ui/badge";

import {
  Button,
} from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Input,
} from "@/components/ui/input";

interface IvrFlowListItem {
  id:
    string;

  name:
    string;

  description:
    string | null;

  status:
    "draft"
    | "published"
    | "archived";

  draft_version:
    number | null;

  published_version:
    number | null;

  has_draft:
    boolean;

  has_published:
    boolean;

  created_at:
    string;

  updated_at:
    string;
}

interface IvrFlowsResponse {
  items:
    IvrFlowListItem[];
}

const statusLabels = {
  draft:
    "Rascunho",

  published:
    "Publicado",

  archived:
    "Arquivado",
} as const;

function formatDate(
  value:
    string,
) {
  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      dateStyle:
        "short",

      timeStyle:
        "short",
    },
  ).format(
    new Date(
      value,
    ),
  );
}

export function IvrFlowsPage() {
  const router =
    useRouter();

  const [
    flows,
    setFlows,
  ] =
    useState<
      IvrFlowListItem[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    createOpen,
    setCreateOpen,
  ] =
    useState(
      false,
    );

  const [
    creating,
    setCreating,
  ] =
    useState(
      false,
    );

  const [
    name,
    setName,
  ] =
    useState(
      "",
    );

  const [
    description,
    setDescription,
  ] =
    useState(
      "",
    );

  const loadFlows =
    useCallback(
      async () => {
        setLoading(
          true,
        );

        try {
          const response =
            await fetch(
              "/api/zenith/ivr-flows",
              {
                cache:
                  "no-store",
              },
            );

          const data =
            (await response.json()) as
              IvrFlowsResponse & {
                error?:
                  string;
              };

          if (
            !response.ok
          ) {
            throw new Error(
              data.error ??
                "Falha ao carregar fluxos IVR.",
            );
          }

          setFlows(
            data.items ??
              [],
          );
        } catch (
          error
        ) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Falha ao carregar fluxos IVR.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [],
    );

  useEffect(
    () => {
      void loadFlows();
    },
    [
      loadFlows,
    ],
  );

  async function createFlow() {
    const normalizedName =
      name.trim();

    if (
      !normalizedName
    ) {
      toast.error(
        "Informe o nome do fluxo.",
      );

      return;
    }

    setCreating(
      true,
    );

    try {
      const response =
        await fetch(
          "/api/zenith/ivr-flows",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                name:
                  normalizedName,

                description:
                  description
                    .trim() ||
                  null,
              }),
          },
        );

      const data =
        (await response.json()) as {
          item?: {
            id:
              string;
          };

          error?:
            string;
        };

      if (
        !response.ok ||
        !data.item
      ) {
        throw new Error(
          data.error ??
            "Falha ao criar fluxo IVR.",
        );
      }

      toast.success(
        "Fluxo IVR criado.",
      );

      setCreateOpen(
        false,
      );

      setName(
        "",
      );

      setDescription(
        "",
      );

      /*
       * O editor /ivr/[id]
       * sera criado no proximo passo.
       */
      router.push(
        `/ivr/${data.item.id}`,
      );
    } catch (
      error
    ) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao criar fluxo IVR.",
      );
    } finally {
      setCreating(
        false,
      );
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b bg-background">
        <div className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Workflow className="size-5" />

              <h1 className="text-xl font-semibold">
                IVR Flow Builder
              </h1>
            </div>

            <p className="mt-1 text-sm text-muted-foreground">
              Crie e publique fluxos de atendimento para
              WaCalls e Asterisk.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() =>
                void loadFlows()
              }
              disabled={
                loading
              }
            >
              {loading ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}

              Atualizar
            </Button>

            <Button
              onClick={() =>
                setCreateOpen(
                  true,
                )
              }
            >
              <Plus className="mr-2 size-4" />
              Novo fluxo
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6">
        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              Carregando fluxos IVR...
            </div>
          </div>
        ) : flows.length === 0 ? (
          <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed">
            <div className="max-w-md px-6 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted">
                <Workflow className="size-6" />
              </div>

              <h2 className="mt-4 text-lg font-semibold">
                Nenhum fluxo IVR
              </h2>

              <p className="mt-2 text-sm text-muted-foreground">
                Crie o primeiro fluxo de atendimento de voz.
                Ele começará automaticamente como Draft v1.
              </p>

              <Button
                className="mt-5"
                onClick={() =>
                  setCreateOpen(
                    true,
                  )
                }
              >
                <Plus className="mr-2 size-4" />
                Criar primeiro fluxo
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="grid grid-cols-[minmax(250px,1fr)_140px_130px_130px_180px_100px] gap-4 border-b bg-muted/40 px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <div>
                Fluxo
              </div>

              <div>
                Status
              </div>

              <div>
                Draft
              </div>

              <div>
                Publicada
              </div>

              <div>
                Atualizado
              </div>

              <div />
            </div>

            {flows.map(
              (
                flow,
              ) => (
                <div
                  key={
                    flow.id
                  }
                  className="grid grid-cols-[minmax(250px,1fr)_140px_130px_130px_180px_100px] items-center gap-4 border-b px-5 py-4 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Activity className="size-4" />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {
                            flow.name
                          }
                        </p>

                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {flow.description ??
                            "Sem descricao"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Badge
                      variant={
                        flow.status ===
                        "published"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {
                        statusLabels[
                          flow.status
                        ]
                      }
                    </Badge>
                  </div>

                  <div className="text-sm">
                    {flow.draft_version !==
                    null ? (
                      <span>
                        v{
                          flow.draft_version
                        }
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        —
                      </span>
                    )}
                  </div>

                  <div className="text-sm">
                    {flow.published_version !==
                    null ? (
                      <span>
                        v{
                          flow.published_version
                        }
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        —
                      </span>
                    )}
                  </div>

                  <div className="text-sm text-muted-foreground">
                    {formatDate(
                      flow.updated_at,
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        router.push(
                          `/ivr/${flow.id}`,
                        )
                      }
                    >
                      <FileEdit className="mr-2 size-4" />
                      Abrir
                    </Button>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </main>

      <Dialog
        open={
          createOpen
        }
        onOpenChange={
          setCreateOpen
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Novo fluxo IVR
            </DialogTitle>

            <DialogDescription>
              O fluxo será criado inicialmente como
              rascunho.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label
                htmlFor="ivr-name"
                className="text-sm font-medium"
              >
                Nome
              </label>

              <Input
                id="ivr-name"
                value={
                  name
                }
                onChange={(
                  event,
                ) =>
                  setName(
                    event.target
                      .value,
                  )
                }
                placeholder="Ex.: Atendimento principal"
                maxLength={
                  120
                }
                disabled={
                  creating
                }
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="ivr-description"
                className="text-sm font-medium"
              >
                Descrição
              </label>

              <textarea
                id="ivr-description"
                value={
                  description
                }
                onChange={(
                  event,
                ) =>
                  setDescription(
                    event.target
                      .value,
                  )
                }
                placeholder="Descrição opcional do fluxo"
                disabled={
                  creating
                }
                rows={
                  4
                }
                className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setCreateOpen(
                  false,
                )
              }
              disabled={
                creating
              }
            >
              Cancelar
            </Button>

            <Button
              onClick={() =>
                void createFlow()
              }
              disabled={
                creating
              }
            >
              {creating && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}

              Criar fluxo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
