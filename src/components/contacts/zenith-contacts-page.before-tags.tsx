"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { Label } from "@/components/ui/label";

const PAGE_SIZE = 25;

interface ZenithContact {
  id: string;
  user_id: string;
  account_id: string;
  phone: string;
  phone_normalized: string;
  name: string | null;
  email: string | null;
  company: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

interface ListResponse {
  items: ZenithContact[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

interface ContactResponse {
  item: ZenithContact;
}

export function ZenithContactsPage() {
  const [contacts, setContacts] = useState<ZenithContact[]>([]);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ZenithContact | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] =
    useState<ZenithContact | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const loadContacts = useCallback(async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });

      if (debouncedSearch) {
        params.set("search", debouncedSearch);
      }

      const response = await fetch(
        `/api/zenith/contacts?${params.toString()}`,
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
        throw new Error("Falha ao carregar contatos");
      }

      const data = (await response.json()) as ListResponse;

      setContacts(data.items ?? []);
      setTotal(data.pagination?.total ?? 0);
    } catch (error) {
      console.error("[contacts] load failed", error);
      toast.error("Não foi possível carregar os contatos.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  function openCreate() {
    setEditing(null);
    setName("");
    setPhone("");
    setEmail("");
    setCompany("");
    setFormOpen(true);
  }

  function openEdit(contact: ZenithContact) {
    setEditing(contact);
    setName(contact.name ?? "");
    setPhone(contact.phone);
    setEmail(contact.email ?? "");
    setCompany(contact.company ?? "");
    setFormOpen(true);
  }

  async function saveContact(event: React.FormEvent) {
    event.preventDefault();

    if (!phone.trim()) {
      toast.error("Informe o telefone.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: name.trim() || null,
        phone: phone.trim(),
        email: email.trim() || null,
        company: company.trim() || null,
      };

      const url = editing
        ? `/api/zenith/contacts/${editing.id}`
        : "/api/zenith/contacts";

      const response = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const body = await response
        .json()
        .catch(() => null) as ContactResponse | { error?: string } | null;

      if (response.status === 409) {
        throw new Error(
          body && "error" in body && body.error
            ? body.error
            : "Já existe um contato com este telefone.",
        );
      }

      if (!response.ok) {
        throw new Error(
          body && "error" in body && body.error
            ? body.error
            : "Falha ao salvar contato.",
        );
      }

      toast.success(
        editing
          ? "Contato atualizado."
          : "Contato criado.",
      );

      setFormOpen(false);
      setEditing(null);

      await loadContacts();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o contato.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteContact() {
    if (!deleteTarget) return;

    setDeleting(true);

    try {
      const response = await fetch(
        `/api/zenith/contacts/${deleteTarget.id}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);

        throw new Error(
          body?.error ?? "Falha ao excluir contato.",
        );
      }

      toast.success("Contato excluído.");

      setDeleteTarget(null);

      if (contacts.length === 1 && page > 1) {
        setPage((current) => current - 1);
      } else {
        await loadContacts();
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o contato.",
      );
    } finally {
      setDeleting(false);
    }
  }

  const totalPages = Math.max(
    1,
    Math.ceil(total / PAGE_SIZE),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Contatos
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            {total === 1
              ? "1 contato cadastrado"
              : `${total} contatos cadastrados`}
          </p>
        </div>

        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Adicionar contato
        </Button>
      </div>

      <div className="relative w-full max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

        <Input
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
          placeholder="Buscar por nome, telefone ou e-mail..."
          className="pl-8"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead className="hidden md:table-cell">
                E-mail
              </TableHead>
              <TableHead className="hidden lg:table-cell">
                Empresa
              </TableHead>
              <TableHead className="hidden lg:table-cell">
                Criado em
              </TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-32 text-center"
                >
                  <Loader2 className="mx-auto size-6 animate-spin text-primary" />
                </TableCell>
              </TableRow>
            ) : contacts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-40 text-center"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Users className="size-8 text-muted-foreground" />

                    <span className="text-sm text-muted-foreground">
                      Nenhum contato encontrado.
                    </span>

                    {!debouncedSearch && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={openCreate}
                      >
                        <Plus className="size-4" />
                        Criar primeiro contato
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell className="font-medium">
                    {contact.name || "Sem nome"}
                  </TableCell>

                  <TableCell className="font-mono text-xs">
                    {contact.phone}
                  </TableCell>

                  <TableCell className="hidden md:table-cell">
                    {contact.email || "-"}
                  </TableCell>

                  <TableCell className="hidden lg:table-cell">
                    {contact.company || "-"}
                  </TableCell>

                  <TableCell className="hidden lg:table-cell">
                    {new Date(
                      contact.created_at,
                    ).toLocaleDateString("pt-BR")}
                  </TableCell>

                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                          />
                        }
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>

                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            openEdit(contact)
                          }
                        >
                          <Pencil className="size-4" />
                          Editar
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() =>
                            setDeleteTarget(contact)
                          }
                        >
                          <Trash2 className="size-4" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Página {page} de {totalPages}
          </span>

          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page <= 1}
              onClick={() =>
                setPage((current) => current - 1)
              }
            >
              <ChevronLeft className="size-4" />
            </Button>

            <Button
              variant="outline"
              size="icon-sm"
              disabled={page >= totalPages}
              onClick={() =>
                setPage((current) => current + 1)
              }
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={formOpen}
        onOpenChange={setFormOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? "Editar contato"
                : "Adicionar contato"}
            </DialogTitle>

            <DialogDescription>
              {editing
                ? "Atualize os dados do contato."
                : "Cadastre um novo contato na conta atual."}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={saveContact}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="contact-name">
                Nome
              </Label>

              <Input
                id="contact-name"
                value={name}
                onChange={(event) =>
                  setName(event.target.value)
                }
                placeholder="Nome do contato"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-phone">
                Telefone *
              </Label>

              <Input
                id="contact-phone"
                value={phone}
                onChange={(event) =>
                  setPhone(event.target.value)
                }
                placeholder="5566999999999"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-email">
                E-mail
              </Label>

              <Input
                id="contact-email"
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                placeholder="cliente@empresa.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-company">
                Empresa
              </Label>

              <Input
                id="contact-company"
                value={company}
                onChange={(event) =>
                  setCompany(event.target.value)
                }
                placeholder="Empresa"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setFormOpen(false)
                }
              >
                Cancelar
              </Button>

              <Button
                type="submit"
                disabled={saving}
              >
                {saving && (
                  <Loader2 className="size-4 animate-spin" />
                )}

                {editing
                  ? "Salvar alterações"
                  : "Criar contato"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Excluir contato
            </DialogTitle>

            <DialogDescription>
              Excluir{" "}
              <strong>
                {deleteTarget?.name ||
                  deleteTarget?.phone}
              </strong>
              ? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setDeleteTarget(null)
              }
            >
              Cancelar
            </Button>

            <Button
              variant="destructive"
              disabled={deleting}
              onClick={deleteContact}
            >
              {deleting && (
                <Loader2 className="size-4 animate-spin" />
              )}

              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
