"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2, CheckCircle2, XCircle } from "lucide-react"

export default function AutomationLogsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [logs, setLogs] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/zenith/automations/${id}/logs`)
      .then(res => res.json())
      .then(data => {
        setLogs(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [id])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/automations")}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Run History</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Recent executions of this automation.</p>
        </div>
      </div>
      
      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="text-destructive text-sm p-4 border border-destructive/20 rounded-md bg-destructive/10">
          {error}
        </div>
      ) : logs?.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40">
          <p className="text-sm text-foreground">No runs yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {logs?.map(log => (
            <div key={log.id} className="p-4 rounded-md border bg-card flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {log.status === 'completed' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : log.status === 'failed' ? (
                    <XCircle className="h-5 w-5 text-destructive" />
                  ) : (
                    <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
                  )}
                  <span className="font-medium">
                    {new Date(log.startedAt).toLocaleString()}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">Trigger: {log.triggerEventId}</span>
              </div>
              <div className="text-sm text-muted-foreground ml-7">
                Status: {log.status} 
                {log.completedAt && ` • Duration: ${new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()}ms`}
              </div>
              {log.errorCode && (
                <div className="text-sm text-destructive ml-7">
                  Error: {log.errorCode} - {log.errorMessage}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
