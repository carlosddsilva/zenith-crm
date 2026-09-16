"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Loader2, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

export function HistoryPanel({ sequenceId }: { sequenceId: string }) {
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchHistory() {
    setLoading(true)
    try {
      const res = await fetch(`/api/zenith/followups/${sequenceId}/history`)
      if (res.ok) {
        const data = await res.json()
        setHistory(data)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [sequenceId])

  const getStatusBadge = (status: string, reason?: string) => {
    if (status === 'completed') return <Badge variant="default" className="bg-green-500">Concluído</Badge>
    if (status === 'active') return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Ativo</Badge>
    if (status === 'failed') return <Badge variant="destructive">Falha</Badge>
    if (status === 'cancelled') return <Badge variant="outline" className="text-orange-600 border-orange-600">Cancelado ({reason || 'manual'})</Badge>
    return <Badge variant="outline">{status}</Badge>
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="text-lg font-semibold">Histórico de Inscrições</h2>
        <Button variant="outline" size="sm" onClick={fetchHistory} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading && history.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            Nenhuma inscrição encontrada para esta sequência.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contato</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Próximo Passo</TableHead>
                  <TableHead>Início</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.contactName || 'Desconhecido'}</div>
                      <div className="text-xs text-muted-foreground">{row.contactPhone || row.contactId}</div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(row.status, row.cancelReason)}
                    </TableCell>
                    <TableCell>
                      {row.status === 'active' && row.nextStepAt ? (
                        <div className="text-sm">
                          Passo {row.currentStepIndex + 1} em:<br/>
                          <span className="text-muted-foreground text-xs">
                            {format(new Date(row.nextStepAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {format(new Date(row.enrolledAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
