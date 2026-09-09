"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface ZenithCustomField {
  id: string;
  account_id: string;
  field_name: string;
  field_type: string;
  field_options: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface FieldsResponse {
  items: ZenithCustomField[];
}

interface CustomFieldsManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomFieldsManager({
  open,
  onOpenChange,
}: CustomFieldsManagerProps) {
  const t = useTranslations("Contacts.customFields");

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            {t("title")}
          </DialogTitle>

          <DialogDescription className="text-muted-foreground">
            {t("desc")}
          </DialogDescription>
        </DialogHeader>

        <CustomFieldsPanel />
      </DialogContent>
    </Dialog>
  );
}

export function CustomFieldsPanel() {
  const t = useTranslations("Contacts.customFields");

  const [fields, setFields] =
    useState<ZenithCustomField[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [newName, setNewName] =
    useState("");

  const [creating, setCreating] =
    useState(false);

  const [busyId, setBusyId] =
    useState<string | null>(null);

  const fetchFields =
    useCallback(async () => {
      setLoading(true);

      try {
        const response = await fetch(
          "/api/zenith/custom-fields",
          {
            credentials: "include",
            cache: "no-store",
          },
        );

        if (response.status === 401) {
          window.location.href =
            "/zenith-login";
          return;
        }

        if (!response.ok) {
          const body = await response
            .json()
            .catch(() => null);

          throw new Error(
            body?.error ??
              "Falha ao carregar campos personalizados.",
          );
        }

        const data =
          (await response.json()) as FieldsResponse;

        setFields(data.items ?? []);
      } catch (error) {
        console.error(
          "[CustomFieldsPanel] load failed:",
          error,
        );

        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os campos personalizados.",
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    void fetchFields();
  }, [fetchFields]);

  function isDuplicate(
    name: string,
    exceptId?: string,
  ): boolean {
    const normalized =
      name.trim().toLocaleLowerCase(
        "pt-BR",
      );

    return fields.some(
      (field) =>
        field.id !== exceptId &&
        field.field_name
          .trim()
          .toLocaleLowerCase(
            "pt-BR",
          ) === normalized,
    );
  }

  async function handleCreate() {
    const name = newName.trim();

    if (!name) {
      return;
    }

    if (isDuplicate(name)) {
      toast.error(
        t("toastDuplicate", {
          name,
        }),
      );
      return;
    }

    setCreating(true);

    try {
      const response = await fetch(
        "/api/zenith/custom-fields",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            field_name: name,
            field_type: "text",
            field_options: null,
          }),
        },
      );

      const body = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(
            "Somente administradores podem criar campos personalizados.",
          );
        }

        throw new Error(
          body?.error ??
            t("toastCreateFailed"),
        );
      }

      toast.success(
        t("toastCreated", {
          name,
        }),
      );

      setNewName("");

      await fetchFields();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("toastCreateFailed"),
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleRename(
    field: ZenithCustomField,
    nextName: string,
  ): Promise<boolean> {
    const name = nextName.trim();

    if (
      !name ||
      name === field.field_name
    ) {
      return true;
    }

    if (
      isDuplicate(
        name,
        field.id,
      )
    ) {
      toast.error(
        t("toastDuplicate", {
          name,
        }),
      );

      return false;
    }

    setBusyId(field.id);

    try {
      const response = await fetch(
        `/api/zenith/custom-fields/${field.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            field_name: name,
            field_type:
              field.field_type,
            field_options:
              field.field_options,
          }),
        },
      );

      const body = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(
            "Somente administradores podem editar campos personalizados.",
          );
        }

        throw new Error(
          body?.error ??
            t("toastRenameFailed"),
        );
      }

      await fetchFields();

      return true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("toastRenameFailed"),
      );

      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(
    field: ZenithCustomField,
  ) {
    if (
      !window.confirm(
        t("deleteConfirm", {
          name: field.field_name,
        }),
      )
    ) {
      return;
    }

    setBusyId(field.id);

    try {
      const response = await fetch(
        `/api/zenith/custom-fields/${field.id}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );

      const body = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(
            "Somente administradores podem excluir campos personalizados.",
          );
        }

        throw new Error(
          body?.error ??
            t("toastDeleteFailed"),
        );
      }

      toast.success(
        t("toastDeleted", {
          name: field.field_name,
        }),
      );

      await fetchFields();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("toastDeleteFailed"),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          value={newName}
          onChange={(event) =>
            setNewName(
              event.target.value,
            )
          }
          onKeyDown={(event) => {
            if (
              event.key === "Enter"
            ) {
              event.preventDefault();

              void handleCreate();
            }
          }}
          placeholder={t(
            "fieldName",
          )}
          className="bg-muted text-foreground"
        />

        <Button
          type="button"
          onClick={() =>
            void handleCreate()
          }
          disabled={
            creating ||
            !newName.trim()
          }
          className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {creating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}

          {t("addField")}
        </Button>
      </div>

      <div className="max-h-72 overflow-y-auto rounded-md border border-border">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("loading")}
          </div>
        ) : fields.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {fields.map(
              (field) => (
                <FieldRow
                  key={field.id}
                  field={field}
                  busy={
                    busyId ===
                    field.id
                  }
                  onRename={
                    handleRename
                  }
                  onDelete={
                    handleDelete
                  }
                />
              ),
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function FieldRow({
  field,
  busy,
  onRename,
  onDelete,
}: {
  field: ZenithCustomField;
  busy: boolean;

  onRename: (
    field: ZenithCustomField,
    name: string,
  ) => Promise<boolean>;

  onDelete: (
    field: ZenithCustomField,
  ) => void;
}) {
  const t = useTranslations(
    "Contacts.customFields",
  );

  const [name, setName] =
    useState(
      field.field_name,
    );

  useEffect(() => {
    setName(
      field.field_name,
    );
  }, [field.field_name]);

  async function commit() {
    if (
      name.trim() ===
      field.field_name
    ) {
      setName(
        field.field_name,
      );

      return;
    }

    const ok = await onRename(
      field,
      name,
    );

    if (!ok) {
      setName(
        field.field_name,
      );
    }
  }

  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <Input
        value={name}
        disabled={busy}
        onChange={(event) =>
          setName(
            event.target.value,
          )
        }
        onBlur={() => {
          void commit();
        }}
        onKeyDown={(event) => {
          if (
            event.key === "Enter"
          ) {
            event.currentTarget.blur();
          }
        }}
        aria-label={t(
          "renameAria",
          {
            name:
              field.field_name,
          },
        )}
        className="h-8 border-transparent bg-transparent text-foreground hover:border-border focus:border-primary"
      />

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={busy}
        onClick={() =>
          onDelete(field)
        }
        title={t(
          "deleteTitle",
        )}
        className="shrink-0 text-muted-foreground hover:text-red-400"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Trash2 className="size-4" />
        )}
      </Button>
    </li>
  );
}
