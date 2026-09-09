"use client";

import {
  Plus,
  Trash2,
} from "lucide-react";

import {
  Button,
} from "@/components/ui/button";

import {
  Checkbox,
} from "@/components/ui/checkbox";

import {
  Input,
} from "@/components/ui/input";

import {
  getIvrNodeDefinition,
} from "@/lib/ivr/nodes";

import type {
  IvrNodeType,
} from "@/lib/ivr/types";

interface Props {
  type:
    IvrNodeType;

  config:
    Record<
      string,
      unknown
    >;

  onChange:
    (
      config:
        Record<
          string,
          unknown
        >,
    ) => void;

  onDelete:
    () => void;
}

interface DtmfOption {
  digit:
    string;

  label:
    string;
}

function textValue(
  config:
    Record<
      string,
      unknown
    >,

  key:
    string,

  fallback =
    "",
) {
  const value =
    config[key];

  return typeof value ===
    "string"
    ? value
    : fallback;
}

function numberValue(
  config:
    Record<
      string,
      unknown
    >,

  key:
    string,

  fallback:
    number,
) {
  const value =
    config[key];

  return typeof value ===
    "number" &&
    Number.isFinite(
      value,
    )
    ? value
    : fallback;
}

function booleanValue(
  config:
    Record<
      string,
      unknown
    >,

  key:
    string,

  fallback =
    false,
) {
  const value =
    config[key];

  return typeof value ===
    "boolean"
    ? value
    : fallback;
}

function getDtmfOptions(
  config:
    Record<
      string,
      unknown
    >,
): DtmfOption[] {
  if (
    !Array.isArray(
      config.options,
    )
  ) {
    return [];
  }

  return config.options
    .filter(
      (
        item,
      ): item is Record<
        string,
        unknown
      > =>
        typeof item ===
          "object" &&
        item !==
          null &&
        !Array.isArray(
          item,
        ),
    )
    .map(
      (
        item,
      ) => ({
        digit:
          typeof item.digit ===
            "string"
            ? item.digit
            : "",

        label:
          typeof item.label ===
            "string"
            ? item.label
            : "",
      }),
    );
}

function FieldLabel(
  {
    children,
  }: {
    children:
      React.ReactNode;
  },
) {
  return (
    <label className="text-xs font-medium text-foreground">
      {children}
    </label>
  );
}

export function IvrNodeProperties(
  {
    type,
    config,
    onChange,
    onDelete,
  }: Props,
) {
  const definition =
    getIvrNodeDefinition(
      type,
    );

  function setField(
    key:
      string,

    value:
      unknown,
  ) {
    onChange({
      ...config,

      [key]:
        value,
    });
  }

  function renderFields() {
    switch (type) {
      case "trigger.inbound":
        return (
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            Este bloco representa o início de uma chamada
            recebida. O canal e o DID serão associados pelo
            binding do fluxo.
          </div>
        );

      case "call.answer":
        return (
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            Atende a chamada antes de continuar para o próximo
            bloco.
          </div>
        );

      case "audio.play":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <FieldLabel>
                Áudio WAV
              </FieldLabel>

              <Input
                value={
                  textValue(
                    config,
                    "audioUrl",
                  )
                }
                onChange={(
                  event,
                ) =>
                  setField(
                    "audioUrl",
                    event.target
                      .value,
                  )
                }
                placeholder="/media/ivr/boas-vindas.wav"
              />

              <p className="text-[11px] text-muted-foreground">
                O upload e armazenamento do WAV serão ligados
                ao seletor de mídia na próxima etapa.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={
                  booleanValue(
                    config,
                    "loop",
                  )
                }
                onCheckedChange={(
                  value,
                ) =>
                  setField(
                    "loop",
                    value ===
                      true,
                  )
                }
              />

              Repetir áudio
            </label>
          </div>
        );

      case "tts.speak":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <FieldLabel>
                Texto
              </FieldLabel>

              <textarea
                value={
                  textValue(
                    config,
                    "text",
                  )
                }
                onChange={(
                  event,
                ) =>
                  setField(
                    "text",
                    event.target
                      .value,
                  )
                }
                rows={
                  6
                }
                placeholder="Olá. Bem-vindo ao nosso atendimento."
                className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <FieldLabel>
                Idioma
              </FieldLabel>

              <select
                value={
                  textValue(
                    config,
                    "language",
                    "pt-BR",
                  )
                }
                onChange={(
                  event,
                ) =>
                  setField(
                    "language",
                    event.target
                      .value,
                  )
                }
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="pt-BR">
                  Português (Brasil)
                </option>

                <option value="en-US">
                  Inglês (Estados Unidos)
                </option>

                <option value="es-ES">
                  Espanhol
                </option>
              </select>
            </div>

            <div className="space-y-2">
              <FieldLabel>
                Voz
              </FieldLabel>

              <Input
                value={
                  textValue(
                    config,
                    "voice",
                    "default",
                  )
                }
                onChange={(
                  event,
                ) =>
                  setField(
                    "voice",
                    event.target
                      .value,
                  )
                }
                placeholder="default"
              />
            </div>
          </div>
        );

      case "input.dtmf": {
        const options =
          getDtmfOptions(
            config,
          );

        function updateOption(
          index:
            number,

          patch:
            Partial<
              DtmfOption
            >,
        ) {
          const next =
            options.map(
              (
                option,
                currentIndex,
              ) =>
                currentIndex ===
                index
                  ? {
                      ...option,
                      ...patch,
                    }
                  : option,
            );

          setField(
            "options",
            next,
          );
        }

        function addOption() {
          const used =
            new Set(
              options.map(
                (
                  item,
                ) =>
                  item.digit,
              ),
            );

          const digit =
            [
              "1",
              "2",
              "3",
              "4",
              "5",
              "6",
              "7",
              "8",
              "9",
              "0",
              "*",
              "#",
            ].find(
              (
                item,
              ) =>
                !used.has(
                  item,
                ),
            ) ??
            "";

          setField(
            "options",
            [
              ...options,
              {
                digit,
                label:
                  "",
              },
            ],
          );
        }

        function removeOption(
          index:
            number,
        ) {
          setField(
            "options",
            options.filter(
              (
                _item,
                currentIndex,
              ) =>
                currentIndex !==
                index,
            ),
          );
        }

        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <FieldLabel>
                Timeout para digitação
              </FieldLabel>

              <Input
                type="number"
                min={
                  1
                }
                max={
                  60
                }
                value={
                  numberValue(
                    config,
                    "timeoutSeconds",
                    10,
                  )
                }
                onChange={(
                  event,
                ) =>
                  setField(
                    "timeoutSeconds",
                    Number(
                      event.target
                        .value,
                    ),
                  )
                }
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FieldLabel>
                  Opções
                </FieldLabel>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={
                    addOption
                  }
                  type="button"
                >
                  <Plus className="mr-1 size-3.5" />
                  Opção
                </Button>
              </div>

              {options.length ===
              0 ? (
                <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                  Nenhuma opção configurada.
                </div>
              ) : (
                <div className="space-y-2">
                  {options.map(
                    (
                      option,
                      index,
                    ) => (
                      <div
                        key={
                          index
                        }
                        className="grid grid-cols-[60px_1fr_36px] gap-2"
                      >
                        <Input
                          value={
                            option.digit
                          }
                          maxLength={
                            1
                          }
                          placeholder="1"
                          onChange={(
                            event,
                          ) =>
                            updateOption(
                              index,
                              {
                                digit:
                                  event
                                    .target
                                    .value,
                              },
                            )
                          }
                        />

                        <Input
                          value={
                            option.label
                          }
                          placeholder="Comercial"
                          onChange={(
                            event,
                          ) =>
                            updateOption(
                              index,
                              {
                                label:
                                  event
                                    .target
                                    .value,
                              },
                            )
                          }
                        />

                        <Button
                          size="icon"
                          variant="ghost"
                          type="button"
                          onClick={() =>
                            removeOption(
                              index,
                            )
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">
              WaCalls não suporta este bloco. Ele poderá ser
              publicado somente em canais compatíveis.
            </p>
          </div>
        );
      }

      case "input.voice":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <FieldLabel>
                Tempo máximo de captura
              </FieldLabel>

              <Input
                type="number"
                min={
                  1
                }
                max={
                  120
                }
                value={
                  numberValue(
                    config,
                    "maxSeconds",
                    10,
                  )
                }
                onChange={(
                  event,
                ) =>
                  setField(
                    "maxSeconds",
                    Number(
                      event.target
                        .value,
                    ),
                  )
                }
              />
            </div>

            <p className="text-[11px] text-muted-foreground">
              Entrada por voz não é suportada pelo WaCalls.
            </p>
          </div>
        );

      case "time.business_hours": {
        const weekdays =
          Array.isArray(
            config.weekdays,
          )
            ? config.weekdays.filter(
                (
                  value,
                ): value is string =>
                  typeof value ===
                  "string",
              )
            : [
                "mon",
                "tue",
                "wed",
                "thu",
                "fri",
              ];

        const days = [
          [
            "mon",
            "Seg",
          ],
          [
            "tue",
            "Ter",
          ],
          [
            "wed",
            "Qua",
          ],
          [
            "thu",
            "Qui",
          ],
          [
            "fri",
            "Sex",
          ],
          [
            "sat",
            "Sáb",
          ],
          [
            "sun",
            "Dom",
          ],
        ] as const;

        function toggleDay(
          day:
            string,
        ) {
          setField(
            "weekdays",
            weekdays.includes(
              day,
            )
              ? weekdays.filter(
                  (
                    item,
                  ) =>
                    item !==
                    day,
                )
              : [
                  ...weekdays,
                  day,
                ],
          );
        }

        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <FieldLabel>
                Fuso horário
              </FieldLabel>

              <Input
                value={
                  textValue(
                    config,
                    "timezone",
                    "America/Cuiaba",
                  )
                }
                onChange={(
                  event,
                ) =>
                  setField(
                    "timezone",
                    event.target
                      .value,
                  )
                }
              />
            </div>

            <div className="space-y-2">
              <FieldLabel>
                Dias de atendimento
              </FieldLabel>

              <div className="grid grid-cols-4 gap-2">
                {days.map(
                  (
                    [
                      value,
                      label,
                    ],
                  ) => (
                    <label
                      key={
                        value
                      }
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <Checkbox
                        checked={
                          weekdays.includes(
                            value,
                          )
                        }
                        onCheckedChange={() =>
                          toggleDay(
                            value,
                          )
                        }
                      />

                      {
                        label
                      }
                    </label>
                  ),
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <FieldLabel>
                  Início
                </FieldLabel>

                <Input
                  type="time"
                  value={
                    textValue(
                      config,
                      "startTime",
                      "08:00",
                    )
                  }
                  onChange={(
                    event,
                  ) =>
                    setField(
                      "startTime",
                      event.target
                        .value,
                    )
                  }
                />
              </div>

              <div className="space-y-2">
                <FieldLabel>
                  Fim
                </FieldLabel>

                <Input
                  type="time"
                  value={
                    textValue(
                      config,
                      "endTime",
                      "18:00",
                    )
                  }
                  onChange={(
                    event,
                  ) =>
                    setField(
                      "endTime",
                      event.target
                        .value,
                    )
                  }
                />
              </div>
            </div>
          </div>
        );
      }

      case "logic.condition":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <FieldLabel>
                Variável
              </FieldLabel>

              <Input
                value={
                  textValue(
                    config,
                    "variable",
                  )
                }
                placeholder="contact.vip"
                onChange={(
                  event,
                ) =>
                  setField(
                    "variable",
                    event.target
                      .value,
                  )
                }
              />
            </div>

            <div className="space-y-2">
              <FieldLabel>
                Operador
              </FieldLabel>

              <select
                value={
                  textValue(
                    config,
                    "operator",
                    "equals",
                  )
                }
                onChange={(
                  event,
                ) =>
                  setField(
                    "operator",
                    event.target
                      .value,
                  )
                }
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="equals">
                  Igual
                </option>

                <option value="not_equals">
                  Diferente
                </option>

                <option value="contains">
                  Contém
                </option>

                <option value="exists">
                  Existe
                </option>

                <option value="greater_than">
                  Maior que
                </option>

                <option value="less_than">
                  Menor que
                </option>
              </select>
            </div>

            <div className="space-y-2">
              <FieldLabel>
                Valor
              </FieldLabel>

              <Input
                value={
                  textValue(
                    config,
                    "value",
                  )
                }
                onChange={(
                  event,
                ) =>
                  setField(
                    "value",
                    event.target
                      .value,
                  )
                }
              />
            </div>
          </div>
        );

      case "queue.route":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <FieldLabel>
                Departamento / Fila
              </FieldLabel>

              <Input
                value={
                  textValue(
                    config,
                    "queueKey",
                  )
                }
                placeholder="comercial"
                onChange={(
                  event,
                ) =>
                  setField(
                    "queueKey",
                    event.target
                      .value,
                  )
                }
              />

              <p className="text-[11px] text-muted-foreground">
                Posteriormente este campo será ligado ao cadastro
                real de departamentos e filas.
              </p>
            </div>

            <div className="space-y-2">
              <FieldLabel>
                Timeout
              </FieldLabel>

              <Input
                type="number"
                min={
                  1
                }
                value={
                  numberValue(
                    config,
                    "timeoutSeconds",
                    30,
                  )
                }
                onChange={(
                  event,
                ) =>
                  setField(
                    "timeoutSeconds",
                    Number(
                      event.target
                        .value,
                    ),
                  )
                }
              />
            </div>
          </div>
        );

      case "extension.route":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <FieldLabel>
                Ramal
              </FieldLabel>

              <Input
                value={
                  textValue(
                    config,
                    "extension",
                  )
                }
                placeholder="1001"
                onChange={(
                  event,
                ) =>
                  setField(
                    "extension",
                    event.target
                      .value,
                  )
                }
              />
            </div>

            <div className="space-y-2">
              <FieldLabel>
                Timeout
              </FieldLabel>

              <Input
                type="number"
                min={
                  1
                }
                value={
                  numberValue(
                    config,
                    "timeoutSeconds",
                    30,
                  )
                }
                onChange={(
                  event,
                ) =>
                  setField(
                    "timeoutSeconds",
                    Number(
                      event.target
                        .value,
                    ),
                  )
                }
              />
            </div>
          </div>
        );

      case "call.transfer":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <FieldLabel>
                Destino
              </FieldLabel>

              <Input
                value={
                  textValue(
                    config,
                    "destination",
                  )
                }
                placeholder="sip:1002 ou destino externo"
                onChange={(
                  event,
                ) =>
                  setField(
                    "destination",
                    event.target
                      .value,
                  )
                }
              />
            </div>

            <p className="text-[11px] text-muted-foreground">
              Transferência não é suportada pelo WaCalls.
            </p>
          </div>
        );

      case "call.hangup":
        return (
          <div className="space-y-2">
            <FieldLabel>
              Motivo
            </FieldLabel>

            <select
              value={
                textValue(
                  config,
                  "reason",
                  "normal",
                )
              }
              onChange={(
                event,
              ) =>
                setField(
                  "reason",
                  event.target
                    .value,
                )
              }
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="normal">
                Encerramento normal
              </option>

              <option value="busy">
                Ocupado
              </option>

              <option value="rejected">
                Rejeitado
              </option>
            </select>
          </div>
        );
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Propriedades
        </p>

        <h2 className="mt-2 font-semibold">
          {
            definition.label
          }
        </h2>

        <p className="mt-1 text-xs text-muted-foreground">
          {
            definition.description
          }
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {
          renderFields()
        }
      </div>

      {type !==
        "trigger.inbound" && (
        <div className="border-t p-4">
          <Button
            variant="destructive"
            className="w-full"
            onClick={
              onDelete
            }
          >
            <Trash2 className="mr-2 size-4" />
            Excluir bloco
          </Button>
        </div>
      )}
    </div>
  );
}
