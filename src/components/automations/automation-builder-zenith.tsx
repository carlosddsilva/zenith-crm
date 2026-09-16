"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Plus, Trash, Play, History, CheckCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { HistoryPanel } from "./history-panel"

import type { AutomationTriggerType, AutomationActionType, AutomationConditionOperator } from "@/types"

export interface BuilderInitialZenith {
  id?: string
  name: string
  description: string
  triggerType: AutomationTriggerType
  triggerConfig: Record<string, unknown>
  status: "active" | "paused" | "draft"
  conditions: any[]
  actions: any[]
}

const TRIGGER_LABELS: Record<string, string> = {
  "contact.created": "Contato criado",
  "deal.created": "Negócio criado",
  "deal.stage_changed": "Negócio mudou de etapa",
  "deal.won": "Negócio ganho",
  "deal.lost": "Negócio perdido",
  "task.completed": "Tarefa concluída",
  "conversation.created": "Conversa criada",
  "message.received": "Mensagem recebida",
}

const ACTION_LABELS: Record<string, string> = {
  "contact.add_tag": "Adicionar tag ao contato",
  "contact.remove_tag": "Remover tag do contato",
  "deal.move_stage": "Mover negócio de etapa",
  "task.create": "Criar tarefa",
  "task.complete": "Concluir tarefa",
  "note.create": "Criar nota",
  "send_message": "Enviar mensagem",
  "conversation.assign": "Atribuir conversa",
}

const OPERATOR_LABELS: Record<string, string> = {
  "equals": "Igual a",
  "not_equals": "Diferente de",
  "contains": "Contém",
  "is_empty": "Está vazio",
  "is_not_empty": "Não está vazio",
}

export function AutomationBuilderZenith({ initial }: { initial: BuilderInitialZenith }) {
  const router = useRouter()
  const isEditing = !!initial.id
  const [state, setState] = useState<BuilderInitialZenith>(initial)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)

  function patchTop<K extends keyof BuilderInitialZenith>(key: K, value: BuilderInitialZenith[K]) {
    setState((s) => ({ ...s, [key]: value }))
  }

  function updateCondition(index: number, key: string, value: any) {
    const newConditions = [...state.conditions]
    newConditions[index] = { ...newConditions[index], [key]: value }
    patchTop("conditions", newConditions)
  }

  function addCondition() {
    patchTop("conditions", [...state.conditions, { field: "", operator: "equals", value: "" }])
  }

  function removeCondition(index: number) {
    patchTop("conditions", state.conditions.filter((_, i) => i !== index))
  }

  function updateAction(index: number, type: string, params: any) {
    const newActions = [...state.actions]
    newActions[index] = { ...newActions[index], type, params }
    patchTop("actions", newActions)
  }

  function updateActionParam(index: number, paramKey: string, value: any) {
    const newActions = [...state.actions]
    newActions[index] = { ...newActions[index], params: { ...newActions[index].params, [paramKey]: value } }
    patchTop("actions", newActions)
  }

  function addAction() {
    patchTop("actions", [...state.actions, { type: "contact.add_tag", params: {} }])
  }

  function removeAction(index: number) {
    patchTop("actions", state.actions.filter((_, i) => i !== index))
  }

  async function save() {
    setSaving(true)
    try {
      const payload = {
        name: state.name || "Sem Título",
        description: state.description || null,
        triggerType: state.triggerType,
        triggerConfig: state.triggerConfig,
        status: state.status,
        conditions: state.conditions,
        actions: state.actions,
      }

      const res = isEditing
        ? await fetch(`/api/zenith/automations/${initial.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/zenith/automations`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body?.error ?? "Erro ao salvar rascunho")
        return
      }
      toast.success(isEditing ? "Rascunho salvo" : "Automação criada")
      if (!isEditing && body?.id) {
        router.replace(`/automations/${body.id}/edit`)
      }
    } finally {
      setSaving(false)
    }
  }

  async function publish() {
    if (!initial.id) {
      toast.error("Salve o rascunho primeiro antes de publicar")
      return
    }
    setPublishing(true)
    try {
      // First save draft
      await save()
      
      // Then publish
      const res = await fetch(`/api/zenith/automations/${initial.id}/publish`, {
        method: "POST",
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body?.error ?? "Erro ao publicar")
        return
      }
      toast.success(`Versão ${body.version} publicada com sucesso!`)
      patchTop("status", "active")
    } finally {
      setPublishing(false)
    }
  }

  async function testDryRun() {
    if (!initial.id) {
      toast.error("Salve a automação primeiro")
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      // Just a dummy payload to test
      const res = await fetch(`/api/zenith/automations/${initial.id}/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: { test: true } }),
      })
      const body = await res.json()
      if (!res.ok) {
        toast.error(body?.error || "Erro no teste")
      } else {
        setTestResult(body)
        toast.success("Teste executado")
      }
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      <header className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-card/80 px-3 py-3 sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={() => router.push("/automations")}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <input
          value={state.name}
          onChange={(e) => patchTop("name", e.target.value)}
          placeholder="Nome da automação"
          className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:bg-muted focus:outline-none sm:text-base"
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline">Ativa</span>
          <Switch
            checked={state.status === "active"}
            onCheckedChange={(v) => patchTop("status", v ? "active" : "paused")}
          />
        </div>
        <Button
          onClick={save}
          disabled={saving || publishing}
          variant="outline"
        >
          {saving && !publishing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Salvar Rascunho
        </Button>
        <Button
          onClick={publish}
          disabled={saving || publishing}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {publishing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
          Publicar
        </Button>
      </header>

      <div className="relative flex-1 overflow-y-auto">
        <Tabs defaultValue="editor" className="w-full h-full flex flex-col">
          <div className="border-b px-4">
            <TabsList className="bg-transparent">
              <TabsTrigger value="editor">Editor de Regras</TabsTrigger>
              <TabsTrigger value="history" disabled={!initial.id}>Histórico de Execuções</TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="editor" className="flex-1 p-4 md:p-8 m-0 overflow-y-auto">
            <div className="mx-auto max-w-3xl space-y-8">
              
              <div className="space-y-4 rounded-xl border p-6 bg-card">
                <h2 className="text-xl font-semibold text-foreground">1. QUANDO (Gatilho)</h2>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">Selecione o evento que inicia a automação</label>
                  <Select value={state.triggerType} onValueChange={(v) => patchTop("triggerType", v as any)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o gatilho" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TRIGGER_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4 rounded-xl border p-6 bg-card">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-foreground">2. SE (Condições)</h2>
                  <Button variant="outline" size="sm" onClick={addCondition}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Condição
                  </Button>
                </div>
                
                {state.conditions.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Executa sempre (sem condições).</p>
                ) : (
                  <div className="space-y-3">
                    {state.conditions.map((cond, i) => (
                      <div key={i} className="flex gap-2 items-start bg-background p-3 rounded-md border">
                        <div className="flex-1 space-y-2">
                          <label className="text-xs text-muted-foreground">Campo (ex: deal.value)</label>
                          <Input 
                            value={cond.field} 
                            onChange={e => updateCondition(i, "field", e.target.value)} 
                            placeholder="deal.value"
                          />
                        </div>
                        <div className="w-[180px] space-y-2">
                          <label className="text-xs text-muted-foreground">Operador</label>
                          <Select value={cond.operator} onValueChange={v => updateCondition(i, "operator", v)}>
                            <SelectTrigger><SelectValue/></SelectTrigger>
                            <SelectContent>
                              {Object.entries(OPERATOR_LABELS).map(([val, label]) => (
                                <SelectItem key={val} value={val}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex-1 space-y-2">
                          <label className="text-xs text-muted-foreground">Valor esperado</label>
                          <Input 
                            value={cond.value} 
                            onChange={e => updateCondition(i, "value", e.target.value)} 
                            placeholder="Valor"
                            disabled={cond.operator === "is_empty" || cond.operator === "is_not_empty"}
                          />
                        </div>
                        <Button variant="ghost" size="icon" className="mt-6" onClick={() => removeCondition(i)}>
                          <Trash className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-4 rounded-xl border p-6 bg-card">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-foreground">3. ENTÃO (Ações)</h2>
                  <Button variant="outline" size="sm" onClick={addAction}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Ação
                  </Button>
                </div>

                {state.actions.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Nenhuma ação definida.</p>
                ) : (
                  <div className="space-y-4">
                    {state.actions.map((act, i) => (
                      <div key={i} className="bg-background p-4 rounded-md border space-y-4 relative">
                        <Button variant="ghost" size="icon" className="absolute top-2 right-2" onClick={() => removeAction(i)}>
                          <Trash className="h-4 w-4 text-destructive" />
                        </Button>
                        
                        <div className="w-2/3">
                          <label className="text-sm font-medium mb-1 block">Ação a executar</label>
                          <Select value={act.type} onValueChange={v => updateAction(i, v, {})}>
                            <SelectTrigger><SelectValue/></SelectTrigger>
                            <SelectContent>
                              {Object.entries(ACTION_LABELS).map(([val, label]) => (
                                <SelectItem key={val} value={val}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                          {act.type === "contact.add_tag" || act.type === "contact.remove_tag" ? (
                            <div className="col-span-2">
                              <label className="text-xs">Tag ID</label>
                              <Input value={act.params.tagId || ""} onChange={e => updateActionParam(i, "tagId", e.target.value)} />
                            </div>
                          ) : act.type === "deal.move_stage" ? (
                            <div className="col-span-2">
                              <label className="text-xs">Stage ID</label>
                              <Input value={act.params.stageId || ""} onChange={e => updateActionParam(i, "stageId", e.target.value)} />
                            </div>
                          ) : act.type === "send_message" ? (
                            <div className="col-span-2">
                              <label className="text-xs">Mensagem</label>
                              <Input value={act.params.message || act.params.text || ""} onChange={e => updateActionParam(i, "text", e.target.value)} />
                            </div>
                          ) : act.type === "task.create" ? (
                            <>
                              <div className="col-span-2">
                                <label className="text-xs">Título da Tarefa</label>
                                <Input value={act.params.title || ""} onChange={e => updateActionParam(i, "title", e.target.value)} />
                              </div>
                              <div>
                                <label className="text-xs">Prioridade</label>
                                <Select value={act.params.priority || "normal"} onValueChange={v => updateActionParam(i, "priority", v)}>
                                  <SelectTrigger><SelectValue/></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="low">Baixa</SelectItem>
                                    <SelectItem value="normal">Normal</SelectItem>
                                    <SelectItem value="high">Alta</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </>
                          ) : act.type === "note.create" ? (
                            <div className="col-span-2">
                              <label className="text-xs">Conteúdo da Nota</label>
                              <Input value={act.params.content || ""} onChange={e => updateActionParam(i, "content", e.target.value)} />
                            </div>
                          ) : act.type === "conversation.assign" ? (
                            <div className="col-span-2">
                              <label className="text-xs">Assignee ID (User)</label>
                              <Input value={act.params.assigneeId || ""} onChange={e => updateActionParam(i, "assigneeId", e.target.value)} />
                            </div>
                          ) : (
                            <div className="col-span-2 text-xs text-muted-foreground italic">Nenhum parâmetro necessário.</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 flex items-center justify-between">
                 <Button variant="secondary" onClick={testDryRun} disabled={testing}>
                   {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                   Simular Execução (Dry Run)
                 </Button>
              </div>
              
              {testResult && (
                <div className="p-4 rounded-md border bg-muted/50 font-mono text-xs">
                  <pre>{JSON.stringify(testResult, null, 2)}</pre>
                </div>
              )}

            </div>
          </TabsContent>

          <TabsContent value="history" className="flex-1 m-0">
            {initial.id && <HistoryPanel automationId={initial.id} />}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
