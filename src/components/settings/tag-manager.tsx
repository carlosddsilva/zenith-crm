"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ZenithTag {
  id: string;
  name: string;
  color: string;
  created_at?: string;
}

interface TagsResponse {
  items: ZenithTag[];
}

interface TagResponse {
  item: ZenithTag;
}

export function TagManager() {
  const [tags, setTags] = useState<ZenithTag[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [editingName, setEditingName] =
    useState("");

  const [editingColor, setEditingColor] =
    useState("#3b82f6");

  const [savingId, setSavingId] =
    useState<string | null>(null);

  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const loadTags = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch(
        "/api/zenith/tags",
        {
          credentials: "include",
          cache: "no-store",
        },
      );

      if (response.status === 401) {
        window.location.href = "/zenith-login";
        return;
      }

      if (!response.ok) {
        const body = await response
          .json()
          .catch(() => null);

        throw new Error(
          body?.error ??
            "Falha ao carregar tags.",
        );
      }

      const data =
        (await response.json()) as TagsResponse;

      setTags(data.items ?? []);
    } catch (error) {
      console.error(
        "[TagManager] load failed:",
        error,
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as tags.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  async function createTag() {
    const normalizedName = name.trim();

    if (!normalizedName) {
      toast.error(
        "Informe o nome da tag.",
      );
      return;
    }

    setCreating(true);

    try {
      const response = await fetch(
        "/api/zenith/tags",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name: normalizedName,
            color,
          }),
        },
      );

      const body = (await response
        .json()
        .catch(() => null)) as
        | TagResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          body &&
            "error" in body &&
            body.error
            ? body.error
            : "Falha ao criar tag.",
        );
      }

      setName("");
      setColor("#3b82f6");

      toast.success(
        "Tag criada com sucesso.",
      );

      await loadTags();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível criar a tag.",
      );
    } finally {
      setCreating(false);
    }
  }

  function beginEdit(tag: ZenithTag) {
    setEditingId(tag.id);
    setEditingName(tag.name);
    setEditingColor(tag.color);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
    setEditingColor("#3b82f6");
  }

  async function saveEdit(tagId: string) {
    const normalizedName =
      editingName.trim();

    if (!normalizedName) {
      toast.error(
        "Informe o nome da tag.",
      );
      return;
    }

    setSavingId(tagId);

    try {
      const response = await fetch(
        `/api/zenith/tags/${tagId}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name: normalizedName,
            color: editingColor,
          }),
        },
      );

      const body = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(
            "Somente administradores podem editar tags.",
          );
        }

        throw new Error(
          body?.error ??
            "Falha ao atualizar tag.",
        );
      }

      toast.success(
        "Tag atualizada com sucesso.",
      );

      cancelEdit();
      await loadTags();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar a tag.",
      );
    } finally {
      setSavingId(null);
    }
  }

  async function deleteTag(tag: ZenithTag) {
    const confirmed = window.confirm(
      `Excluir a tag "${tag.name}"?\n\nEla será removida também dos contatos associados.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(tag.id);

    try {
      const response = await fetch(
        `/api/zenith/tags/${tag.id}`,
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
            "Somente administradores podem excluir tags.",
          );
        }

        throw new Error(
          body?.error ??
            "Falha ao excluir tag.",
        );
      }

      if (editingId === tag.id) {
        cancelEdit();
      }

      toast.success(
        "Tag excluída com sucesso.",
      );

      await loadTags();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir a tag.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Tags className="size-5" />

          <h3 className="text-base font-semibold">
            Tags
          </h3>
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          Organize e classifique seus contatos
          usando tags personalizadas.
        </p>
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="mb-4">
          <h4 className="text-sm font-medium">
            Nova tag
          </h4>

          <p className="mt-1 text-xs text-muted-foreground">
            Crie uma tag disponível para os
            contatos desta conta.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="new-tag-name">
              Nome
            </Label>

            <Input
              id="new-tag-name"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              placeholder="Ex.: Cliente VIP"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void createTag();
                }
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-tag-color">
              Cor
            </Label>

            <input
              id="new-tag-color"
              type="color"
              value={color}
              onChange={(event) =>
                setColor(event.target.value)
              }
              className="h-9 w-14 cursor-pointer rounded-md border border-input bg-background p-1"
            />
          </div>

          <Button
            type="button"
            onClick={() => void createTag()}
            disabled={
              creating || !name.trim()
            }
          >
            {creating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}

            Criar tag
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : tags.length === 0 ? (
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 p-6 text-center">
            <Tags className="size-8 text-muted-foreground" />

            <p className="text-sm text-muted-foreground">
              Nenhuma tag cadastrada.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tags.map((tag) => {
              const editing =
                editingId === tag.id;

              const saving =
                savingId === tag.id;

              const deleting =
                deletingId === tag.id;

              return (
                <div
                  key={tag.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
                >
                  {editing ? (
                    <>
                      <div className="flex flex-1 items-center gap-3">
                        <input
                          type="color"
                          value={editingColor}
                          onChange={(event) =>
                            setEditingColor(
                              event.target.value,
                            )
                          }
                          className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
                        />

                        <Input
                          value={editingName}
                          onChange={(event) =>
                            setEditingName(
                              event.target.value,
                            )
                          }
                          className="max-w-sm"
                          autoFocus
                          onKeyDown={(event) => {
                            if (
                              event.key ===
                              "Enter"
                            ) {
                              event.preventDefault();

                              void saveEdit(
                                tag.id,
                              );
                            }

                            if (
                              event.key ===
                              "Escape"
                            ) {
                              cancelEdit();
                            }
                          }}
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() =>
                            void saveEdit(
                              tag.id,
                            )
                          }
                          disabled={
                            saving ||
                            !editingName.trim()
                          }
                        >
                          {saving ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Check className="size-4" />
                          )}

                          Salvar
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={
                            cancelEdit
                          }
                          disabled={saving}
                        >
                          <X className="size-4" />
                          Cancelar
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-1 items-center gap-3">
                        <span
                          className="size-4 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              tag.color,
                          }}
                        />

                        <span
                          className="inline-flex rounded-full border px-2.5 py-1 text-xs font-medium"
                          style={{
                            borderColor:
                              tag.color,
                            color: tag.color,
                          }}
                        >
                          {tag.name}
                        </span>

                        <span className="font-mono text-xs text-muted-foreground">
                          {tag.color}
                        </span>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            beginEdit(tag)
                          }
                          disabled={deleting}
                        >
                          <Pencil className="size-4" />
                          Editar
                        </Button>

                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() =>
                            void deleteTag(tag)
                          }
                          disabled={deleting}
                        >
                          {deleting ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}

                          Excluir
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {tags.length === 1
          ? "1 tag cadastrada."
          : `${tags.length} tags cadastradas.`}
      </p>
    </div>
  );
}
