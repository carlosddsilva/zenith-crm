import {
  LayoutGrid,
  CalendarDays,
  Palette,
  PhoneCall,
  PlugZap,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";

export const SETTINGS_SECTIONS = [
  "overview",
  "appearance",
  "whatsapp",
  "voice",
  "calendar",
  "fields",
  "members",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const DEFAULT_SECTION: SettingsSection = "overview";

export interface SectionMeta {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
  group: "top" | "account" | "workspace";
}

export const SECTION_META: Record<SettingsSection, SectionMeta> = {
  overview: { id: "overview", label: "Overview", icon: LayoutGrid, group: "top" },
  appearance: { id: "appearance", label: "Appearance", icon: Palette, group: "account" },
  whatsapp: { id: "whatsapp", label: "Canais WhatsApp", icon: PlugZap, group: "workspace" },
  voice: { id: "voice", label: "Zenith Calls", icon: PhoneCall, group: "workspace" },
  calendar: { id: "calendar", label: "Google Calendar", icon: CalendarDays, group: "workspace" },
  fields: { id: "fields", label: "Campos & Tags", icon: Tags, group: "workspace" },
  members: { id: "members", label: "Membros", icon: Users, group: "workspace" },
};

export const RAIL_GROUPS: {
  label: string | null;
  group: SectionMeta["group"];
}[] = [
  { label: null, group: "top" },
  { label: "Account", group: "account" },
  { label: "Workspace", group: "workspace" },
];

function isSection(value: string | null): value is SettingsSection {
  return Boolean(
    value && (SETTINGS_SECTIONS as readonly string[]).includes(value),
  );
}

export function resolveSection(raw: string | null): SettingsSection {
  if (raw === "tags" || raw === "custom-fields") return "fields";
  if (isSection(raw)) return raw;
  return DEFAULT_SECTION;
}
