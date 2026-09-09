"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  Check,
  CircleX,
  Clock3,
  Loader2,
  Save,
  Workflow,
} from "lucide-react";

import {
  useRouter,
} from "next/navigation";

import {
  toast,
} from "sonner";

import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";

import {
  Badge,
} from "@/components/ui/badge";

import {
  Button,
} from "@/components/ui/button";

import {
  Checkbox,
} from "@/components/ui/checkbox";

import {
  IvrNodeProperties,
} from "@/components/ivr/ivr-node-properties";

import {
  ivrCapabilities,
} from "@/lib/ivr/capabilities";

import {
  getIvrNodeDefinition,
  ivrNodeCatalog,
} from "@/lib/ivr/nodes";

import type {
  IvrCapabilitySupport,
  IvrFlowDefinition,
  IvrNodeType,
  IvrProviderId,
  IvrValidationResult,
} from "@/lib/ivr/types";

interface IvrFlowEditorProps {
  flowId:
    string;
}

interface IvrFlowResponse {
  item: {
    flow: {
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

      created_at:
        string;

      updated_at:
        string;
    };

    draft:
      IvrVersionRecord | null;

    published:
      IvrVersionRecord | null;

    current:
      IvrVersionRecord | null;
  };
}

interface IvrVersionRecord {
  id:
    string;

  version:
    number;

  status:
    "draft"
    | "published"
    | "archived";

  definition:
    IvrFlowDefinition;

  publishedAt?:
    string | null;

  createdAt?:
    string;
}

interface DraftResponse {
  ok:
    boolean;

  item: {
    id:
      string;

    version:
      number;

    status:
      string;

    definition:
      IvrFlowDefinition;
  };

  validation:
    IvrValidationResult;
}

interface IvrCanvasNodeData
  extends Record<
    string,
    unknown
  > {
  ivrType:
    IvrNodeType;

  config:
    Record<
      string,
      unknown
    >;
}

type IvrCanvasNode =
  Node<
    IvrCanvasNodeData,
    "ivr"
  >;

const providerLabels:
  Record<
    IvrProviderId,
    string
  > = {
  asterisk:
    "Asterisk",

  wacalls:
    "WaCalls",
};

const categoryLabels = {
  trigger:
    "Inicio",

  call:
    "Chamada",

  media:
    "Midia",

  input:
    "Entrada",

  logic:
    "Logica",

  routing:
    "Roteamento",
};

function CapabilityIndicator(
  {
    support,
  }: {
    support:
      IvrCapabilitySupport;
  },
) {
  if (
    support ===
    "ready"
  ) {
    return (
      <span
        className="inline-flex items-center"
        title="Implementado"
      >
        <Check className="size-3.5 text-emerald-600" />
      </span>
    );
  }

  if (
    support ===
    "planned"
  ) {
    return (
      <span
        className="inline-flex items-center"
        title="Provider suporta; runtime Zenith pendente"
      >
        <Clock3 className="size-3.5 text-amber-500" />
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center"
      title="Nao suportado pelo provider"
    >
      <CircleX className="size-3.5 text-destructive" />
    </span>
  );
}

function getNodeProviderStatus(
  type:
    IvrNodeType,

  provider:
    IvrProviderId,
): IvrCapabilitySupport {
  const definition =
    getIvrNodeDefinition(
      type,
    );

  if (
    definition
      .requiredCapabilities
      .length ===
    0
  ) {
    return "ready";
  }

  const supports =
    definition
      .requiredCapabilities
      .map(
        (
          capability,
        ) =>
          ivrCapabilities[
            provider
          ][
            capability
          ],
      );

  if (
    supports.includes(
      "unsupported",
    )
  ) {
    return "unsupported";
  }

  if (
    supports.includes(
      "planned",
    )
  ) {
    return "planned";
  }

  return "ready";
}

function IvrNodeCard(
  {
    data,
    selected,
  }:
    NodeProps<
      IvrCanvasNode
    >,
) {
  const definition =
    getIvrNodeDefinition(
      data.ivrType,
    );

  const outputs =
    data.ivrType ===
      "input.dtmf" &&
    Array.isArray(
      data.config.options,
    )
      ? data.config.options
          .filter(
            (
              option,
            ): option is Record<
              string,
              unknown
            > =>
              typeof option ===
                "object" &&
              option !==
                null &&
              !Array.isArray(
                option,
              ) &&
              typeof option.digit ===
                "string" &&
              Boolean(
                option.digit,
              ),
          )
          .map(
            (
              option,
            ) => ({
              id:
                `digit:${String(
                  option.digit,
                )}`,

              label:
                typeof option.label ===
                  "string" &&
                option.label
                  ? `${option.digit} - ${option.label}`
                  : String(
                      option.digit,
                    ),
            }),
          )
      : data.ivrType ===
          "input.voice"
        ? [
            {
              id:
                "recognized",

              label:
                "Reconhecido",
            },
            {
              id:
                "unrecognized",

              label:
                "Nao reconhecido",
            },
            {
              id:
                "timeout",

              label:
                "Timeout",
            },
          ]
        : definition.outputs ??
          [];

  return (
    <div
      className={[
        "min-w-[190px] rounded-xl border bg-card shadow-sm",
        selected
          ? "border-primary ring-2 ring-primary/20"
          : "border-border",
      ].join(" ")}
    >
      {data.ivrType !==
        "trigger.inbound" && (
        <Handle
          type="target"
          position={
            Position.Top
          }
          className="!size-3"
        />
      )}

      <div className="border-b px-4 py-3">
        <p className="text-sm font-semibold">
          {
            definition.label
          }
        </p>

        <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">
          {
            definition.description
          }
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-2 text-[11px] text-muted-foreground">
        <span>
          Asterisk
        </span>

        <CapabilityIndicator
          support={
            getNodeProviderStatus(
              data.ivrType,
              "asterisk",
            )
          }
        />

        <span>
          WaCalls
        </span>

        <CapabilityIndicator
          support={
            getNodeProviderStatus(
              data.ivrType,
              "wacalls",
            )
          }
        />
      </div>

      {definition.outputMode !==
        "none" &&
        outputs.length ===
          0 && (
          <Handle
            type="source"
            position={
              Position.Bottom
            }
            id="default"
            className="!size-3"
          />
        )}

      {outputs.map(
        (
          output,
          index,
        ) => {
          const left =
            (
              (index + 1) /
              (outputs.length +
                1)
            ) *
            100;

          return (
            <div
              key={
                output.id
              }
            >
              <span
                className="absolute bottom-[-24px] -translate-x-1/2 whitespace-nowrap rounded bg-background px-1 text-[9px] text-muted-foreground"
                style={{
                  left:
                    `${left}%`,
                }}
              >
                {
                  output.label
                }
              </span>

              <Handle
                type="source"
                position={
                  Position.Bottom
                }
                id={
                  output.id
                }
                className="!size-3"
                style={{
                  left:
                    `${left}%`,
                }}
              />
            </div>
          );
        },
      )}
    </div>
  );
}

const nodeTypes:
  NodeTypes = {
  ivr:
    IvrNodeCard,
};

function persistedToCanvasNodes(
  definition:
    IvrFlowDefinition,
): IvrCanvasNode[] {
  return definition.nodes.map(
    (
      node,
    ) => ({
      id:
        node.id,

      type:
        "ivr",

      position:
        node.position,

      data: {
        ivrType:
          node.type,

        config:
          node.data ??
          {},
      },
    }),
  );
}

function persistedToCanvasEdges(
  definition:
    IvrFlowDefinition,
): Edge[] {
  return definition.edges.map(
    (
      edge,
    ) => ({
      id:
        edge.id,

      source:
        edge.source,

      target:
        edge.target,

      sourceHandle:
        edge.sourceHandle ??
        undefined,

      targetHandle:
        edge.targetHandle ??
        undefined,

      label:
        edge.label ??
        undefined,
    }),
  );
}

function IvrEditorCanvas(
  {
    flowId,
  }:
    IvrFlowEditorProps,
) {
  const router =
    useRouter();

  const {
    screenToFlowPosition,
  } =
    useReactFlow();

  const [
    nodes,
    setNodes,
    onNodesChange,
  ] =
    useNodesState<
      IvrCanvasNode
    >([]);

  const [
    edges,
    setEdges,
    onEdgesChange,
  ] =
    useEdgesState<
      Edge
    >([]);

  const [
    flowName,
    setFlowName,
  ] =
    useState(
      "Fluxo IVR",
    );

  const [
    flowStatus,
    setFlowStatus,
  ] =
    useState<
      "draft"
      | "published"
      | "archived"
    >(
      "draft",
    );

  const [
    currentVersion,
    setCurrentVersion,
  ] =
    useState<
      number | null
    >(
      null,
    );

  const [
    providers,
    setProviders,
  ] =
    useState<
      IvrProviderId[]
    >([]);

  const [
    maxSteps,
    setMaxSteps,
  ] =
    useState(
      100,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );

  const [
    validation,
    setValidation,
  ] =
    useState<
      IvrValidationResult | null
    >(
      null,
    );

  const [
    selectedNodeId,
    setSelectedNodeId,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const selectedNode =
    useMemo(
      () =>
        nodes.find(
          (
            node,
          ) =>
            node.id ===
            selectedNodeId,
        ) ??
        null,
      [
        nodes,
        selectedNodeId,
      ],
    );

  const palette =
    useMemo(
      () =>
        Object.values(
          ivrNodeCatalog,
        ).filter(
          (
            item,
          ) =>
            item.type !==
            "trigger.inbound",
        ),
      [],
    );

  const loadFlow =
    useCallback(
      async () => {
        setLoading(
          true,
        );

        try {
          const response =
            await fetch(
              `/api/zenith/ivr-flows/${flowId}`,
              {
                cache:
                  "no-store",
              },
            );

          const data =
            (await response.json()) as
              IvrFlowResponse & {
                error?:
                  string;
              };

          if (
            !response.ok
          ) {
            throw new Error(
              data.error ??
                "Falha ao carregar fluxo IVR.",
            );
          }

          setFlowName(
            data.item.flow
              .name,
          );

          setFlowStatus(
            data.item.flow
              .status,
          );

          const current =
            data.item.current;

          if (!current) {
            throw new Error(
              "Fluxo IVR sem versao disponivel.",
            );
          }

          const definition =
            current.definition;

          setCurrentVersion(
            current.version,
          );

          setNodes(
            persistedToCanvasNodes(
              definition,
            ),
          );

          setEdges(
            persistedToCanvasEdges(
              definition,
            ),
          );

          setProviders(
            definition
              .settings
              ?.providers ??
              [],
          );

          setMaxSteps(
            definition
              .settings
              ?.maxSteps ??
              100,
          );
        } catch (
          error
        ) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Falha ao carregar fluxo IVR.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [
        flowId,
        setEdges,
        setNodes,
      ],
    );

  useEffect(
    () => {
      void loadFlow();
    },
    [
      loadFlow,
    ],
  );

  const onConnect =
    useCallback(
      (
        connection:
          Connection,
      ) => {
        setEdges(
          (
            current,
          ) =>
            addEdge(
              {
                ...connection,

                id:
                  `edge-${crypto.randomUUID()}`,
              },
              current,
            ),
        );
      },
      [
        setEdges,
      ],
    );

  function toggleProvider(
    provider:
      IvrProviderId,
  ) {
    setProviders(
      (
        current,
      ) =>
        current.includes(
          provider,
        )
          ? current.filter(
              (
                item,
              ) =>
                item !==
                provider,
            )
          : [
              ...current,
              provider,
            ],
    );
  }

  function onDragStart(
    event:
      React.DragEvent,

    type:
      IvrNodeType,
  ) {
    event.dataTransfer
      .setData(
        "application/zenith-ivr-node",
        type,
      );

    event.dataTransfer
      .effectAllowed =
      "move";
  }

  function onDragOver(
    event:
      React.DragEvent,
  ) {
    event.preventDefault();

    event.dataTransfer
      .dropEffect =
      "move";
  }

  function onDrop(
    event:
      React.DragEvent,
  ) {
    event.preventDefault();

    const type =
      event.dataTransfer
        .getData(
          "application/zenith-ivr-node",
        ) as
        IvrNodeType;

    if (
      !type ||
      !Object.prototype
        .hasOwnProperty.call(
          ivrNodeCatalog,
          type,
        )
    ) {
      return;
    }

    if (
      type ===
      "trigger.inbound"
    ) {
      return;
    }

    const position =
      screenToFlowPosition({
        x:
          event.clientX,

        y:
          event.clientY,
      });

    const node:
      IvrCanvasNode = {
      id:
        `node-${crypto.randomUUID()}`,

      type:
        "ivr",

      position,

      data: {
        ivrType:
          type,

        config:
          {},
      },
    };

    setNodes(
      (
        current,
      ) => [
        ...current,
        node,
      ],
    );
  }

  function updateSelectedNodeConfig(
    config:
      Record<
        string,
        unknown
      >,
  ) {
    if (!selectedNodeId) {
      return;
    }

    setNodes(
      (
        current,
      ) =>
        current.map(
          (
            node,
          ) =>
            node.id ===
            selectedNodeId
              ? {
                  ...node,

                  data: {
                    ...node.data,
                    config,
                  },
                }
              : node,
        ),
    );
  }

  function deleteSelectedNode() {
    if (!selectedNodeId) {
      return;
    }

    const selected =
      nodes.find(
        (
          node,
        ) =>
          node.id ===
          selectedNodeId,
      );

    if (!selected) {
      return;
    }

    if (
      selected.data.ivrType ===
      "trigger.inbound"
    ) {
      toast.error(
        "O bloco Inicio nao pode ser excluido.",
      );

      return;
    }

    setNodes(
      (
        current,
      ) =>
        current.filter(
          (
            node,
          ) =>
            node.id !==
            selectedNodeId,
        ),
    );

    setEdges(
      (
        current,
      ) =>
        current.filter(
          (
            edge,
          ) =>
            edge.source !==
              selectedNodeId &&
            edge.target !==
              selectedNodeId,
        ),
    );

    setSelectedNodeId(
      null,
    );
  }
  function buildDefinition():
    IvrFlowDefinition {
    return {
      nodes:
        nodes.map(
          (
            node,
          ) => ({
            id:
              node.id,

            type:
              node.data
                .ivrType,

            position: {
              x:
                node.position.x,

              y:
                node.position.y,
            },

            data:
              node.data
                .config ??
              {},
          }),
        ),

      edges:
        edges.map(
          (
            edge,
          ) => ({
            id:
              edge.id,

            source:
              edge.source,

            target:
              edge.target,

            sourceHandle:
              edge.sourceHandle ??
              null,

            targetHandle:
              edge.targetHandle ??
              null,

            label:
              typeof edge.label ===
                "string"
                ? edge.label
                : null,
          }),
        ),

      settings: {
        providers,
        maxSteps,
      },
    };
  }

  async function saveDraft() {
    if (
      providers.length ===
      0
    ) {
      toast.error(
        "Selecione pelo menos um provider.",
      );

      return;
    }

    setSaving(
      true,
    );

    try {
      const response =
        await fetch(
          `/api/zenith/ivr-flows/${flowId}/draft`,
          {
            method:
              "PUT",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                definition:
                  buildDefinition(),
              }),
          },
        );

      const data =
        (await response.json()) as
          DraftResponse & {
            error?:
              string;
          };

      if (
        !response.ok
      ) {
        throw new Error(
          data.error ??
            "Falha ao salvar rascunho.",
        );
      }

      setCurrentVersion(
        data.item
          .version,
      );

      setValidation(
        data.validation,
      );

      if (
        data.validation
          .valid
      ) {
        toast.success(
          `Rascunho v${data.item.version} salvo e valido.`,
        );
      } else {
        toast.warning(
          `Rascunho v${data.item.version} salvo com ${data.validation.errors.length} erro(s).`,
        );
      }
    } catch (
      error
    ) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao salvar rascunho.",
      );
    } finally {
      setSaving(
        false,
      );
    }
  }

  if (
    loading
  ) {
    return (
      <div className="flex h-full min-h-[600px] items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)] min-h-[650px] flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b bg-background px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            onClick={() =>
              router.push(
                "/ivr",
              )
            }
          >
            <ArrowLeft className="size-4" />
          </Button>

          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Workflow className="size-4" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-semibold">
                {
                  flowName
                }
              </h1>

              <Badge variant="secondary">
                v
                {
                  currentVersion ??
                  "—"
                }
              </Badge>

              <Badge
                variant={
                  flowStatus ===
                  "published"
                    ? "default"
                    : "outline"
                }
              >
                {
                  flowStatus ===
                  "published"
                    ? "Publicado"
                    : flowStatus ===
                      "archived"
                    ? "Arquivado"
                    : "Rascunho"
                }
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground">
              Editor visual de atendimento de voz
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {validation && (
            <Badge
              variant={
                validation.valid
                  ? "default"
                  : "destructive"
              }
            >
              {validation.valid
                ? "Fluxo valido"
                : `${validation.errors.length} erro(s)`}
            </Badge>
          )}

          <Button
            onClick={() =>
              void saveDraft()
            }
            disabled={
              saving
            }
          >
            {saving ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}

            Salvar rascunho
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[280px] shrink-0 overflow-y-auto border-r bg-card">
          <div className="border-b p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Canais
            </p>

            <div className="mt-3 space-y-3">
              {(
                [
                  "asterisk",
                  "wacalls",
                ] as
                  IvrProviderId[]
              ).map(
                (
                  provider,
                ) => (
                  <label
                    key={
                      provider
                    }
                    className="flex cursor-pointer items-center gap-3"
                  >
                    <Checkbox
                      checked={
                        providers.includes(
                          provider,
                        )
                      }
                      onCheckedChange={() =>
                        toggleProvider(
                          provider,
                        )
                      }
                    />

                    <span className="text-sm">
                      {
                        providerLabels[
                          provider
                        ]
                      }
                    </span>
                  </label>
                ),
              )}
            </div>
          </div>

          <div className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Blocos
            </p>

            <div className="mt-3 space-y-2">
              {palette.map(
                (
                  item,
                ) => (
                  <div
                    key={
                      item.type
                    }
                    draggable
                    onDragStart={(
                      event,
                    ) =>
                      onDragStart(
                        event,
                        item.type,
                      )
                    }
                    className="cursor-grab rounded-lg border bg-background p-3 transition-colors hover:bg-muted/60 active:cursor-grabbing"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {
                            item.label
                          }
                        </p>

                        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {
                            categoryLabels[
                              item.category
                            ]
                          }
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          title="Asterisk"
                          className="flex items-center gap-1 text-[10px]"
                        >
                          A
                          <CapabilityIndicator
                            support={
                              getNodeProviderStatus(
                                item.type,
                                "asterisk",
                              )
                            }
                          />
                        </span>

                        <span
                          title="WaCalls"
                          className="flex items-center gap-1 text-[10px]"
                        >
                          W
                          <CapabilityIndicator
                            support={
                              getNodeProviderStatus(
                                item.type,
                                "wacalls",
                              )
                            }
                          />
                        </span>
                      </div>
                    </div>
                  </div>
                ),
              )}
            </div>

            <div className="mt-5 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Check className="size-3.5 text-emerald-600" />
                Implementado
              </div>

              <div className="mt-1.5 flex items-center gap-2">
                <Clock3 className="size-3.5 text-amber-500" />
                Provider suporta, runtime pendente
              </div>

              <div className="mt-1.5 flex items-center gap-2">
                <CircleX className="size-3.5 text-destructive" />
                Provider nao suporta
              </div>
            </div>
          </div>
        </aside>

        <main
          className="min-w-0 flex-1 bg-muted/20"
          onDragOver={
            onDragOver
          }
          onDrop={
            onDrop
          }
        >
          <ReactFlow
            nodes={
              nodes
            }
            edges={
              edges
            }
            onNodesChange={
              onNodesChange
            }
            onEdgesChange={
              onEdgesChange
            }
            onConnect={
              onConnect
            }
onNodesDelete={(
              deletedNodes,
            ) => {
              if (
                selectedNodeId &&
                deletedNodes.some(
                  (
                    node,
                  ) =>
                    node.id ===
                    selectedNodeId,
                )
              ) {
                setSelectedNodeId(
                  null,
                );
              }
            }}
            onNodeClick={(
              _event,
              node,
            ) => {
              setSelectedNodeId(
                node.id,
              );
            }}

            onPaneClick={() => {
              setSelectedNodeId(
                null,
              );
            }}
            nodeTypes={
              nodeTypes
            }
            fitView
            deleteKeyCode={[
              "Backspace",
              "Delete",
            ]}
            minZoom={
              0.25
            }
            maxZoom={
              2
            }
          >
            <Background />

            <Controls />

            <MiniMap
              pannable
              zoomable
            />
          </ReactFlow>
        </main>

        <aside className="w-[330px] shrink-0 overflow-hidden border-l bg-card">
          {selectedNode ? (
            <IvrNodeProperties
              type={
                selectedNode
                  .data
                  .ivrType
              }
              config={
                selectedNode
                  .data
                  .config
              }
              onChange={
                updateSelectedNodeConfig
              }
              onDelete={
                deleteSelectedNode
              }
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <div className="text-center">
                <p className="text-sm font-medium">
                  Propriedades
                </p>

                <p className="mt-2 text-xs text-muted-foreground">
                  Selecione um bloco no canvas para editar sua
                  configuracao.
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export function IvrFlowEditor(
  props:
    IvrFlowEditorProps,
) {
  return (
    <ReactFlowProvider>
      <IvrEditorCanvas
        {...props}
      />
    </ReactFlowProvider>
  );
}










