"use client"

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import {
  UserPlus,
  Building,
  Briefcase,
  Target,
  CheckCircle,
  AlertTriangle,
  Clock,
  Calendar,
  MessageSquare,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  Inbox
} from 'lucide-react'

import type { DashboardMetrics } from '@/lib/dashboard/types'

import { MetricCard } from '@/components/dashboard/metric-card'
import { SkeletonCard } from '@/components/dashboard/skeleton'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { PipelineDonut } from '@/components/dashboard/pipeline-donut'
import { ActivityFeed } from '@/components/dashboard/activity-feed'

import { useTranslations } from 'next-intl'
import { startOfDay, subDays } from 'date-fns'

export default function DashboardPage() {
  const t = useTranslations('Dashboard.page')
  const { defaultCurrency, loading: authLoading } = useAuth()
  
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  const [rangeDays, setRangeDays] = useState<number>(30)

  const loadData = useCallback(async () => {
    if (authLoading) return
    setLoading(true)
    try {
      const from = subDays(startOfDay(new Date()), rangeDays).toISOString()
      const to = new Date().toISOString()
      const res = await fetch(`/api/zenith/dashboard?from=${from}&to=${to}`)
      if (!res.ok) throw new Error('Failed to load dashboard metrics')
      const data = await res.json()
      setMetrics(data)
    } catch (err) {
      console.error('[dashboard] failed:', err)
    } finally {
      setLoading(false)
    }
  }, [authLoading, rangeDays])

  useEffect(() => {
    if (authLoading) return
    void loadData()
  }, [authLoading, loadData])

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('description')}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <select
            className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={rangeDays}
            onChange={(e) => setRangeDays(Number(e.target.value))}
            disabled={loading}
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Quick actions */}
      <QuickActions />

      {/* CRM Overview */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">CRM Overview</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loading || !metrics ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <MetricCard
                title="Total Contacts"
                value={metrics.contacts.total.toLocaleString()}
                icon={UserPlus}
                subtitle={`+${metrics.contacts.newInPeriod} in period`}
              />
              <MetricCard
                title="Total Companies"
                value={metrics.companies.total.toLocaleString()}
                icon={Building}
                subtitle={`+${metrics.companies.newInPeriod} in period`}
              />
              <MetricCard
                title="Active Deals"
                value={metrics.deals.open.toLocaleString()}
                icon={Briefcase}
                subtitle={formatCurrency(metrics.deals.openValue, defaultCurrency)}
              />
              <MetricCard
                title="Deals Won"
                value={metrics.deals.won.toLocaleString()}
                icon={Target}
                subtitle={formatCurrency(metrics.deals.wonValue, defaultCurrency)}
              />
            </>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left Column: Productivity & Comms */}
        <div className="space-y-8 lg:col-span-2">
          
          {/* Productivity / Tasks */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Productivity</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {loading || !metrics ? (
                Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
              ) : (
                <>
                  <MetricCard
                    title="Due Today"
                    value={metrics.tasks.dueToday.toLocaleString()}
                    icon={Calendar}
                  />
                  <MetricCard
                    title="Overdue"
                    value={metrics.tasks.overdue.toLocaleString()}
                    icon={AlertTriangle}
                  />
                  <MetricCard
                    title="Completed"
                    value={metrics.tasks.completedInPeriod.toLocaleString()}
                    icon={CheckCircle}
                  />
                </>
              )}
            </div>
          </section>

          {/* Communications */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Communications</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {loading || !metrics ? (
                Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
              ) : (
                <>
                  <MetricCard
                    title="Open Convs"
                    value={metrics.inbox.open.toLocaleString()}
                    icon={MessageSquare}
                  />
                  <MetricCard
                    title="Unread Messages"
                    value={metrics.inbox.unread.toLocaleString()}
                    icon={Inbox}
                  />
                  <MetricCard
                    title="Total Calls"
                    value={metrics.calls.totalInPeriod.toLocaleString()}
                    icon={Phone}
                  />
                  <MetricCard
                    title="Missed Calls"
                    value={metrics.calls.missed.toLocaleString()}
                    icon={PhoneMissed}
                  />
                </>
              )}
            </div>
          </section>

          {/* Activity Feed */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Recent Activity</h2>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <ActivityFeed items={metrics?.activities || null} loading={loading} />
            </div>
          </section>

        </div>

        {/* Right Column: Pipeline Donut */}
        <div className="space-y-8">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Pipeline Stages</h2>
            <PipelineDonut
              data={metrics?.funnel || null}
              loading={loading}
              currency={defaultCurrency}
            />
          </section>
        </div>
      </div>
    </div>
  )
}
