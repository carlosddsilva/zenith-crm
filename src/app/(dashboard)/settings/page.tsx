"use client";

import { Suspense, useMemo, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { AppearancePanel } from "@/components/settings/appearance-panel";
import { FieldsAndTagsPanel } from "@/components/settings/fields-and-tags-panel";
import { MembersPanel } from "@/components/settings/members-panel";
import { GoogleCalendarSettings } from "@/components/settings/google-calendar-settings";
import { MessagingChannelsSettings } from "@/components/settings/messaging-channels-settings";
import { SettingsRail } from "@/components/settings/settings-rail";
import {
  resolveSection,
  type SettingsSection,
} from "@/components/settings/settings-sections";
import { VoiceChannelsSettings } from "@/components/settings/voice-channels-settings";
import { VoiceNotificationSettings } from "@/components/settings/voice-notification-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsOverview() {
  const { account, accountRole, profile } = useAuth();

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Conta Zenith</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-muted-foreground">Usuário</p>
          <p className="font-medium">{profile?.full_name ?? profile?.email}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Empresa</p>
          <p className="font-medium">{account?.name ?? "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Permissão</p>
          <p className="font-medium uppercase">{accountRole ?? "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Moeda padrão</p>
          <p className="font-medium">{account?.default_currency ?? "—"}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { defaultCurrency } = useAuth();
  const { mode } = useTheme();
  const t = useTranslations("Settings");
  const section = resolveSection(searchParams.get("tab"));

  const go = (next: SettingsSection) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  const hints: Partial<Record<SettingsSection, ReactNode>> = useMemo(
    () => ({
      appearance: mode.charAt(0).toUpperCase() + mode.slice(1),
      overview: defaultCurrency,
    }),
    [mode, defaultCurrency],
  );

  const panel: Record<SettingsSection, ReactNode> = {
    overview: <SettingsOverview />,
    appearance: <AppearancePanel />,
    whatsapp: <MessagingChannelsSettings />,
    voice: (
      <div className="space-y-6">
        <VoiceNotificationSettings />
        <VoiceChannelsSettings />
      </div>
    ),
    calendar: <GoogleCalendarSettings />,
    fields: <FieldsAndTagsPanel />,
    members: <MembersPanel />,
  };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("pageTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("pageDesc")}</p>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[236px_minmax(0,1fr)] lg:items-start">
        <SettingsRail active={section} onSelect={go} hints={hints} />
        <div className="min-w-0">{panel[section]}</div>
      </div>
    </div>
  );
}
