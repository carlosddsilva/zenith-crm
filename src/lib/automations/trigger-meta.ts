import type { AutomationTriggerType } from '@/types'

export interface TriggerMeta {
  label: string
  /** Tailwind classes for the Badge pill on the list row. */
  pillClass: string
}

export const TRIGGER_META: Record<AutomationTriggerType, TriggerMeta> = {
  'message.received': {
    label: 'Message Received',
    pillClass: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  },
  'contact.created': {
    label: 'Contact Created',
    pillClass: 'border-primary/30 bg-primary/10 text-primary',
  },
  'deal.created': {
    label: 'Deal Created',
    pillClass: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  },
  'deal.stage_changed': {
    label: 'Deal Stage Changed',
    pillClass: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  },
  'deal.won': {
    label: 'Deal Won',
    pillClass: 'border-teal-500/30 bg-teal-500/10 text-teal-300',
  },
  'deal.lost': {
    label: 'Deal Lost',
    pillClass: 'border-red-500/30 bg-red-500/10 text-red-300',
  },
  'task.completed': {
    label: 'Task Completed',
    pillClass: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
  },
  'conversation.created': {
    label: 'Conversation Created',
    pillClass: 'border-pink-500/30 bg-pink-500/10 text-pink-300',
  },
}

export function triggerMeta(t: AutomationTriggerType | string): TriggerMeta {
  return (
    TRIGGER_META[t as AutomationTriggerType] ?? {
      label: t,
      pillClass: 'border-slate-500/30 bg-slate-500/10 text-muted-foreground',
    }
  )
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'never'
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 2_592_000) return `${Math.floor(diffSec / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}
