"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { Loader2, SlidersHorizontal } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ZenithCustomField {
  id: string;
  field_name: string;
  field_type: string;
  field_options: Record<string, unknown> | null;
  value?: string | null;
}

interface FieldsResponse {
  items: ZenithCustomField[];
}

export interface ZenithContactCustomFieldsHandle {
  save: (contactId: string) => Promise<void>;
}

interface Props {
  contactId: string | null;
}

function getOptions(
  field: ZenithCustomField,
): string[] {
  const options =
    field.field_options?.options;

  if (!Array.isArray(options)) {
    return [];
  }

  return options.filter(
    (option): option is string =>
      typeof option === "string",
  );
}

export const ZenithContactCustomFields =
  forwardRef<
    ZenithContactCustomFieldsHandle,
    Props
  >(function ZenithContactCustomFields(
    {
      contactId,
    },
    ref,
  ) {
    const [fields, setFields] =
      useState<ZenithCustomField[]>([]);

    const [values, setValues] =
      useState<Record<string, string>>(
        {},
      );

    const [loading, setLoading] =
      useState(true);

    const load = useCallback(async () => {
      setLoading(true);

      try {
        const url = contactId
          ? `/api/zenith/contacts/${contactId}/custom-fields`
          : "/api/zenith/custom-fields";

        const response = await fetch(
          url,
          {
            credentials: "include",
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error(
            "Falha ao carregar campos personalizados.",
          );
        }

        const data =
          (await response.json()) as FieldsResponse;

        const nextValues:
          Record<string, string> = {};

        for (const field of data.items ?? []) {
          nextValues[field.id] =
            field.value ?? "";
        }

        setFields(data.items ?? []);
        setValues(nextValues);
      } finally {
        setLoading(false);
      }
    }, [contactId]);

    useEffect(() => {
      void load();
    }, [load]);

    useImperativeHandle(
      ref,
      () => ({
        async save(targetContactId) {
          if (fields.length === 0) {
            return;
          }

          const payload:
            Record<
              string,
              string | null
            > = {};

          for (const field of fields) {
            const value =
              values[field.id] ?? "";

            payload[field.id] =
              value === ""
                ? null
                : value;
          }

          const response = await fetch(
            `/api/zenith/contacts/${targetContactId}/custom-fields`,
            {
              method: "PUT",
              credentials: "include",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                values: payload,
              }),
            },
          );

          const body = await response
            .json()
            .catch(() => null);

          if (!response.ok) {
            throw new Error(
              body?.error ??
                "Falha ao salvar campos personalizados.",
            );
          }
        },
      }),
      [fields, values],
    );

    function updateValue(
      fieldId: string,
      value: string,
    ) {
      setValues((current) => ({
        ...current,
        [fieldId]: value,
      }));
    }

    if (loading) {
      return (
        <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Carregando campos personalizados...
        </div>
      );
    }

    if (fields.length === 0) {
      return null;
    }

    return (
      <div className="space-y-4 rounded-lg border p-4">
        <div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="size-4" />

            <Label>
              Campos personalizados
            </Label>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            Informações adicionais definidas
            nas configurações da conta.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => {
            const value =
              values[field.id] ?? "";

            const type =
              field.field_type
                .toLowerCase()
                .trim();

            if (type === "boolean") {
              return (
                <div
                  key={field.id}
                  className="space-y-2"
                >
                  <Label>
                    {field.field_name}
                  </Label>

                  <label className="flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm">
                    <input
                      type="checkbox"
                      checked={
                        value === "true"
                      }
                      onChange={(event) =>
                        updateValue(
                          field.id,
                          event.target
                            .checked
                            ? "true"
                            : "false",
                        )
                      }
                    />

                    Sim
                  </label>
                </div>
              );
            }

            if (type === "select") {
              const options =
                getOptions(field);

              return (
                <div
                  key={field.id}
                  className="space-y-2"
                >
                  <Label>
                    {field.field_name}
                  </Label>

                  <select
                    value={value}
                    onChange={(event) =>
                      updateValue(
                        field.id,
                        event.target.value,
                      )
                    }
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">
                      Selecione...
                    </option>

                    {options.map(
                      (option) => (
                        <option
                          key={option}
                          value={option}
                        >
                          {option}
                        </option>
                      ),
                    )}
                  </select>
                </div>
              );
            }

            let inputType:
              | "text"
              | "number"
              | "date"
              | "email" = "text";

            if (type === "number") {
              inputType = "number";
            } else if (
              type === "date"
            ) {
              inputType = "date";
            } else if (
              type === "email"
            ) {
              inputType = "email";
            }

            return (
              <div
                key={field.id}
                className="space-y-2"
              >
                <Label
                  htmlFor={`custom-field-${field.id}`}
                >
                  {field.field_name}
                </Label>

                <Input
                  id={`custom-field-${field.id}`}
                  type={inputType}
                  value={value}
                  onChange={(event) =>
                    updateValue(
                      field.id,
                      event.target.value,
                    )
                  }
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  });
