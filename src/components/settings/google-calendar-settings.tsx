'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Loader2, RefreshCw, Unplug } from 'lucide-react';
import { toast } from 'sonner';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Connection {
  id: string;
  status: string;
  calendarId: string | null;
  calendarSummary: string | null;
  calendarTimezone: string | null;
  lastSyncedAt: string | null;
  watchExpiresAt: string | null;
  lastErrorCode: string | null;
}

interface Conflict {
  id: string;
  appointmentId: string;
  local: { title?: string; startTime?: string } | null;
  remote: { title?: string; startTime?: string } | null;
}

interface CalendarOption {
  id: string;
  summary: string;
  timeZone?: string;
  primary?: boolean;
}

export function GoogleCalendarSettings() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [calendars, setCalendars] = useState<CalendarOption[]>([]);
  const [selection, setSelection] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/zenith/integrations/google-calendar', {
        cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? 'Falha ao carregar a integração.');
      setConnection(body.connection);
      setConflicts(body.conflicts ?? []);
      if (body.connection?.status === 'connected') {
        const calendarsResponse = await fetch(
          '/api/zenith/integrations/google-calendar/calendars',
          { cache: 'no-store' }
        );
        const calendarsBody = await calendarsResponse.json();
        if (calendarsResponse.ok) {
          setCalendars(calendarsBody.items ?? []);
          setSelection(
            body.connection.calendarId ??
              calendarsBody.items?.find((item: CalendarOption) => item.primary)
                ?.id ??
              ''
          );
        }
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Falha ao carregar a integração.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function request(method: string, body?: unknown) {
    setBusy(true);
    try {
      const response = await fetch('/api/zenith/integrations/google-calendar', {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(result?.error ?? 'Operação não concluída.');
      await load();
      return result;
    } finally {
      setBusy(false);
    }
  }

  async function chooseCalendar() {
    try {
      await request('PATCH', { calendarId: selection });
      toast.success(
        'Calendário selecionado. A sincronização inicial foi enfileirada.'
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Falha ao selecionar calendário.'
      );
    }
  }

  async function disconnect() {
    if (
      !window.confirm(
        'Desconectar e revogar o acesso? Os compromissos do CRM e as cópias já existentes no Google serão preservados.'
      )
    )
      return;
    try {
      const result = await request('DELETE');
      toast.success(
        result.remoteCleanup === 'completed'
          ? 'Google Calendar desconectado.'
          : 'Desconectado localmente; a limpeza remota precisa ser verificada.'
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Falha ao desconectar.'
      );
    }
  }

  async function syncNow() {
    try {
      await request('POST');
      toast.success('Reconciliação enfileirada.');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Falha ao enfileirar sincronização.'
      );
    }
  }

  async function resolve(conflict: Conflict, resolution: 'zenith' | 'google') {
    if (!connection) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/zenith/integrations/google-calendar/conflicts/${conflict.id}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ connectionId: connection.id, resolution }),
        }
      );
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(body?.error ?? 'Falha ao resolver conflito.');
      toast.success(
        resolution === 'google'
          ? 'Versão do Google aplicada.'
          : 'Versão do Zenith será enviada.'
      );
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Falha ao resolver conflito.'
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Carregando Google Calendar...
      </div>
    );

  const connected = connection?.status === 'connected';
  return (
    <section className="max-w-3xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Google Calendar</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Conecte um calendário por usuário. Somente compromissos vinculados ao
          Zenith são sincronizados; a agenda pessoal não é importada.
        </p>
      </div>

      {!connected ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-4 py-6">
            <CalendarDays className="text-muted-foreground size-8" />
            <div>
              <p className="font-medium">Nenhuma conexão ativa</p>
              <p className="text-muted-foreground text-sm">
                A autorização acontece no Google e os tokens ficam cifrados no
                servidor.
              </p>
            </div>
            <a
              className={buttonVariants()}
              href="/api/zenith/integrations/google-calendar/oauth/start"
            >
              Conectar Google Calendar
            </a>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conexão ativa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="block space-y-2 text-sm">
              <span className="font-medium">Calendário sincronizado</span>
              <select
                className="border-input bg-background h-9 w-full rounded-md border px-3"
                value={selection}
                onChange={(event) => setSelection(event.target.value)}
              >
                <option value="">Selecione...</option>
                {calendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {calendar.summary}
                    {calendar.primary ? ' (principal)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  busy || !selection || selection === connection.calendarId
                }
                onClick={() => void chooseCalendar()}
              >
                Salvar calendário
              </Button>
              {connection.calendarId && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void syncNow()}
                >
                  <RefreshCw className="size-4" />
                  Sincronizar agora
                </Button>
              )}
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => void disconnect()}
              >
                <Unplug className="size-4" />
                Desconectar
              </Button>
            </div>
            <div className="text-muted-foreground text-xs">
              <p>
                Selecionado: {connection.calendarSummary ?? 'nenhum'}
                {connection.calendarTimezone
                  ? ` · ${connection.calendarTimezone}`
                  : ''}
              </p>
              <p>
                Última sincronização:{' '}
                {connection.lastSyncedAt
                  ? new Date(connection.lastSyncedAt).toLocaleString()
                  : 'pendente'}
              </p>
              {connection.lastErrorCode && (
                <p className="text-destructive">
                  Estado: {connection.lastErrorCode}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {conflicts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Conflitos que precisam de decisão
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {conflicts.map((conflict) => (
              <div
                key={conflict.id}
                className="border-border rounded-md border p-3 text-sm"
              >
                <p className="font-medium">
                  {conflict.local?.title ??
                    conflict.remote?.title ??
                    'Compromisso'}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div className="bg-muted rounded p-2">
                    <p className="text-xs font-medium">Zenith</p>
                    <p>
                      {conflict.local?.startTime
                        ? new Date(conflict.local.startTime).toLocaleString()
                        : '—'}
                    </p>
                  </div>
                  <div className="bg-muted rounded p-2">
                    <p className="text-xs font-medium">Google</p>
                    <p>
                      {conflict.remote?.startTime
                        ? new Date(conflict.remote.startTime).toLocaleString()
                        : '—'}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void resolve(conflict, 'zenith')}
                  >
                    Usar Zenith
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void resolve(conflict, 'google')}
                  >
                    Usar Google
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
