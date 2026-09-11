// Shared result shapes the dashboard components consume. Centralised
// here so each component stays thin and the page-level loader wires
// them up without type gymnastics.

export interface DashboardMetrics {
  period: {
    from: string
    to: string
  }
  contacts: {
    total: number
    newInPeriod: number
  }
  companies: {
    total: number
    newInPeriod: number
  }
  deals: {
    open: number
    won: number
    lost: number
    openValue: number
    wonValue: number
    lostValue: number
  }
  funnel: PipelineDonutData
  tasks: {
    open: number
    overdue: number
    dueToday: number
    completedInPeriod: number
  }
  inbox: {
    open: number
    pending: number
    unread: number
  }
  calls: {
    totalInPeriod: number
    answered: number
    missed: number
  }
  activities: ActivityItem[]
}

export interface PipelineStageSlice {
  id: string
  name: string
  color: string
  dealCount: number
  totalValue: number
}

export interface PipelineDonutData {
  stages: PipelineStageSlice[]
  totalValue: number
}

export type ActivityKind =
  | 'message'
  | 'deal'
  | 'broadcast'
  | 'automation'
  | 'contact'
  | 'call'
  | 'task'
  | 'note'
  | 'company'

export interface ActivityItem {
  id: string
  kind: ActivityKind
  /** Primary line of text rendered in the feed. Pre-formatted. */
  text: string
  /** ISO timestamp the item happened at, drives relative-time + sort. */
  at: string
  /** Optional deep-link for the whole row (not all items have a target). */
  href?: string
}
