"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface Channel {
  id: string;
  name: string;
  provider: "meta" | "evolution";
  is_active: boolean;
}

export default function NewBroadcastPage() {
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [channelId, setChannelId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void fetch("/api/zenith/messaging-channels", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao carregar canais");
        const data = (await response.json()) as { items?: Channel[] };
        const active = (data.items ?? []).filter((item) => item.is_active);
        setChannels(active);
        setChannelId(active[0]?.id ?? "");
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Falha ao carregar canais");
      })
      .finally(() => setLoading(false));
  }, []);

  async function create(start: boolean) {
    if (!name.trim() || !message.trim() || !channelId) {
      toast.error("Nome, mensagem e canal são obrigatórios.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/zenith/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          messagingChannelId: channelId,
          content: { type: "text", text: message.trim() },
          audience: { type: "all" },
        }),
      });
      const created = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !created.id) {
        throw new Error(created.error ?? "Falha ao criar disparo");
      }

      if (start) {
        const startResponse = await fetch(
          `/api/zenith/broadcasts/${created.id}/start`,
          { method: "POST" },
        );
        const result = (await startResponse.json()) as {
          error?: string;
          count?: number;
        };
        if (!startResponse.ok) {
          throw new Error(result.error ?? "Falha ao iniciar disparo");
        }
        toast.success(`Disparo iniciado para ${result.count ?? 0} contatos.`);
      } else {
        toast.success("Rascunho salvo.");
      }

      router.push(`/broadcasts/${created.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao criar disparo");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Novo disparo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="broadcast-name">Nome</Label>
            <Input
              id="broadcast-name"
              maxLength={255}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Canal</Label>
            <Select value={channelId} onValueChange={(value) => setChannelId(value ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={loading ? "Carregando…" : "Selecione um canal"} />
              </SelectTrigger>
              <SelectContent>
                {channels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    {channel.name} ({channel.provider})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="broadcast-message">Mensagem</Label>
            <Textarea
              id="broadcast-message"
              maxLength={4096}
              rows={7}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              O envio usa um snapshot limitado dos contatos com telefone válido.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={submitting} onClick={() => void create(false)}>
              Salvar rascunho
            </Button>
            <Button disabled={submitting || loading || channels.length === 0} onClick={() => void create(true)}>
              {submitting ? <Loader2 className="animate-spin" /> : <Send />}
              Iniciar controlado
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
