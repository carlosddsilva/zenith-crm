"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Bell,
  BellOff,
  CheckCircle2,
} from "lucide-react";

import {
  canUseVoiceNotifications,
  requestVoiceNotificationPermission,
  voiceNotificationPermission,
} from "@/lib/voice/browser/notifications";

type PermissionState =
  NotificationPermission |
  "unsupported";

export function VoiceNotificationSettings() {
  const [permission, setPermission] =
    useState<PermissionState>(
      "unsupported",
    );

  const [requesting, setRequesting] =
    useState(false);

  useEffect(
    () => {
      if (
        !canUseVoiceNotifications()
      ) {
        setPermission(
          "unsupported",
        );

        return;
      }

      setPermission(
        voiceNotificationPermission(),
      );
    },
    [],
  );

  async function enableNotifications() {
    if (
      !canUseVoiceNotifications()
    ) {
      setPermission(
        "unsupported",
      );

      return;
    }

    setRequesting(
      true,
    );

    try {
      const result =
        await requestVoiceNotificationPermission();

      setPermission(
        result,
      );
    } finally {
      setRequesting(
        false,
      );
    }
  }

  const granted =
    permission ===
    "granted";

  const denied =
    permission ===
    "denied";

  const unsupported =
    permission ===
    "unsupported";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          {granted ? (
            <CheckCircle2 className="size-4 text-emerald-500" />
          ) : denied ? (
            <BellOff className="size-4 text-muted-foreground" />
          ) : (
            <Bell className="size-4 text-muted-foreground" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="font-medium">
            Notificações de chamadas
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            Receba um alerta do navegador quando uma chamada chegar enquanto o Zenith CRM estiver em segundo plano.
          </p>

          {granted && (
            <p className="mt-2 text-sm text-emerald-600">
              Notificações ativadas neste navegador.
            </p>
          )}

          {denied && (
            <p className="mt-2 text-sm text-destructive">
              As notificações estão bloqueadas pelo navegador. Libere a permissão nas configurações do site.
            </p>
          )}

          {unsupported && (
            <p className="mt-2 text-sm text-muted-foreground">
              Este navegador não oferece suporte às notificações necessárias.
            </p>
          )}

          {!granted &&
            !denied &&
            !unsupported && (
              <button
                type="button"
                disabled={requesting}
                onClick={
                  enableNotifications
                }
                className="mt-3 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-opacity disabled:pointer-events-none disabled:opacity-50"
              >
                <Bell className="mr-2 size-4" />

                {requesting
                  ? "Aguardando permissão..."
                  : "Ativar notificações de chamadas"}
              </button>
            )}
        </div>
      </div>
    </div>
  );
}