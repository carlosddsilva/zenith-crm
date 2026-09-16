"use client"

import { useEffect, useState } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

import { Button } from "@/components/ui/button"

export function HistoryPanel({ automationId }: { automationId: string }) {
  const [runs, setRuns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchHistory() {
    setLoading(true)
    try {
      const res = await fetch(`/api/zenith/automations/${automationId}/history?limit=50`)
      if (res.ok) {
        const body = await res.json()
        setRuns(body)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [automationId])

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b flex items-center justify-between bg-card">
        <h3 className="font-semibold">Histórico de Execuções</h3>
        <Button variant="ghost" size="sm" onClick={fetchHistory} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && runs.length === 0 ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : runs.length === 0 ? (
          <p className="text-center text-muted-foreground p-8">Nenhuma execução registrada.</p>
        ) : (
          runs.map((run) => (
            <div key={run.id} className="border rounded-md p-4 bg-card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    run.status === 'completed' ? 'bg-green-100 text-green-700' :
                    run.status === 'failed' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {run.status.toUpperCase()}
                  </span>
                  <span className="text-sm font-semibold">Versão {run.version}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(run.startedAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Gatilho: {run.triggerType} (ID: {run.triggerEventId.split('-').pop()})
                </div>
              </div>
              
              {run.errorCode && (
                <div className="bg-red-50 text-red-600 text-xs p-2 rounded mb-3 border border-red-100">
                  Erro Crítico: {run.errorCode}
                </div>
              )}

              {run.actions && run.actions.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Ações executadas:</p>
                  {run.actions.map((act: any) => (
                    <div key={act.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/50">
                      <span className="font-mono">{act.actionIndex + 1}. {act.actionType}</span>
                      <span className={`
                        ${act.status === 'completed' ? 'text-green-600' : ''}
                        ${act.status === 'failed' ? 'text-red-600' : ''}
                        ${act.status === 'running' ? 'text-yellow-600' : ''}
                      `}>
                        {act.status}
                        {act.errorCode ? ` (${act.errorCode})` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
