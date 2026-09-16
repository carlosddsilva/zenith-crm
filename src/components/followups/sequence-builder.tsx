"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Plus, Trash, History, CheckCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { HistoryPanel } from "./history-panel"

import type { AutomationTriggerType } from "@/types"

export interface BuilderInitialSequence {
  id?: string
  name: string
  description: string
  triggerType: AutomationTriggerType
  status: "active" | "paused" | "draft"
  conditions: any[]
  steps: any[]
  cancelOnReply: boolean
  cancelOnDealClosed: boolean
  timeZone: string
  quietHoursStart: string | null
  quietHoursEnd: string | null
}

const TRIGGER_LABELS: Record<string, string> = {
  "contact.created": "Contato criado",
  "deal.created": "Negócio criado",
  "deal.stage_changed": "Negócio mudou de etapa",
}

const ACTION_LABELS: Record<string, string> = {
  "contact.add_tag": "Adicionar tag ao contato",
  "deal.move_stage": "Mover negócio de etapa",
  "task.create": "Criar tarefa",
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

export function SequenceBuilder({ initial }: { initial: BuilderInitialSequence }) {
  const router = useRouter()
  const isEditing = !!initial.id
  const [state, setState] = useState<BuilderInitialSequence>(initial)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)

  function patchTop<K extends keyof BuilderInitialSequence>(key: K, value: BuilderInitialSequence[K]) {
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

  function updateStep(index: number, key: string, value: any) {
    const newSteps = [...state.steps]
    newSteps[index] = { ...newSteps[index], [key]: value }
    patchTop("steps", newSteps)
  }

  function updateStepAction(index: number, type: string) {
    const newSteps = [...state.steps]
    newSteps[index] = { ...newSteps[index], action: { type, params: {} } }
    patchTop("steps", newSteps)
  }

  function updateStepActionParam(index: number, paramKey: string, value: any) {
    const newSteps = [...state.steps]
    newSteps[index].action.params[paramKey] = value
    patchTop("steps", newSteps)
  }

  function addStep() {
    patchTop("steps", [...state.steps, { delayMinutes: 1440, action: { type: "send_message", params: {} } }])
  }

  function removeStep(index: number) {
    patchTop("steps", state.steps.filter((_, i) => i !== index))
  }

  async function save() {
    setSaving(true)
    try {
      const payload = {
        name: state.name || "Sem Título",
        description: state.description || null,
        triggerType: state.triggerType,
        status: state.status,
        conditions: state.conditions,
        steps: state.steps,
        cancelOnReply: state.cancelOnReply,
        cancelOnDealClosed: state.cancelOnDealClosed,
        timeZone: state.timeZone,
        quietHoursStart: state.quietHoursStart,
        quietHoursEnd: state.quietHoursEnd,
      }

      const res = isEditing
        ? await fetch(`/api/zenith/followups/${initial.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/zenith/followups`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body?.error ?? "Erro ao salvar rascunho")
        return
      }
      toast.success(isEditing ? "Rascunho salvo" : "Sequência criada")
      if (!isEditing && body?.id) {
        router.replace(`/followups/${body.id}/edit`)
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
      await save()
      const res = await fetch(`/api/zenith/followups/${initial.id}/publish`, { method: "POST" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body?.error ?? "Erro ao publicar")
        return
      }
      toast.success(`Versão ${body.publishedVersion.version} publicada com sucesso!`)
      patchTop("status", "active")
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      <header className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-card/80 px-3 py-3 sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={() => router.push("/followups")}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <input
          value={state.name}
          onChange={(e) => patchTop("name", e.target.value)}
          placeholder="Nome da sequência"
          className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:bg-muted focus:outline-none sm:text-base"
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline">Ativa</span>
          <Switch
            checked={state.status === "active"}
            onCheckedChange={(v) => patchTop("status", v ? "active" : "paused")}
          />
        </div>
        <Button onClick={save} disabled={saving || publishing} variant="outline">
          {saving && !publishing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Salvar Rascunho
        </Button>
        <Button onClick={publish} disabled={saving || publishing} className="bg-primary text-primary-foreground hover:bg-primary/90">
          {publishing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
          Publicar
        </Button>
      </header>

      <div className="relative flex-1 overflow-y-auto">
        <Tabs defaultValue="editor" className="w-full h-full flex flex-col">
          <div className="border-b px-4">
            <TabsList className="bg-transparent">
              <TabsTrigger value="editor">Editor de Sequência</TabsTrigger>
              <TabsTrigger value="history" disabled={!initial.id}>Inscrições</TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="editor" className="flex-1 p-4 md:p-8 m-0 overflow-y-auto">
            <div className="mx-auto max-w-3xl space-y-8">
              
              <div className="space-y-4 rounded-xl border p-6 bg-card">
                <h2 className="text-xl font-semibold text-foreground">1. QUANDO (Gatilho)</h2>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">Selecione o evento que inicia a sequência</label>
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
                  <h2 className="text-xl font-semibold text-foreground">2. SE (Condições de Entrada)</h2>
                  <Button variant="outline" size="sm" onClick={addCondition}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Condição
                  </Button>
                </div>
                
                {state.conditions.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Entra sempre (sem condições).</p>
                ) : (
                  <div className="space-y-3">
                    {state.conditions.map((cond, i) => (
                      <div key={i} className="flex gap-2 items-start bg-background p-3 rounded-md border">
                        <div className="flex-1 space-y-2">
                          <label className="text-xs text-muted-foreground">Campo (ex: deal.value)</label>
                          <Input value={cond.field} onChange={e => updateCondition(i, "field", e.target.value)} />
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
                          <Input value={cond.value} onChange={e => updateCondition(i, "value", e.target.value)} disabled={cond.operator === "is_empty" || cond.operator === "is_not_empty"} />
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
                <h2 className="text-xl font-semibold text-foreground">3. REGRAS DA CAMPANHA</h2>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Cancelar se cliente responder?</label>
                      <Switch checked={state.cancelOnReply} onCheckedChange={v => patchTop("cancelOnReply", v)} />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Cancelar se negócio fechar?</label>
                      <Switch checked={state.cancelOnDealClosed} onCheckedChange={v => patchTop("cancelOnDealClosed", v)} />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-sm font-medium">Quiet Hours (Não enviar entre)</label>
                    <div className="flex gap-2 items-center">
                      <Input type="time" value={state.quietHoursStart || ""} onChange={e => patchTop("quietHoursStart", e.target.value || null)} />
                      <span>e</span>
                      <Input type="time" value={state.quietHoursEnd || ""} onChange={e => patchTop("quietHoursEnd", e.target.value || null)} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 rounded-xl border p-6 bg-card">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-foreground">4. ETAPAS (Drip)</h2>
                  <Button variant="outline" size="sm" onClick={addStep}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Etapa
                  </Button>
                </div>

                {state.steps.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Nenhuma etapa definida.</p>
                ) : (
                  <div className="space-y-6">
                    {state.steps.map((step, i) => (
                      <div key={i} className="bg-background p-4 rounded-md border space-y-4 relative">
                        <Button variant="ghost" size="icon" className="absolute top-2 right-2" onClick={() => removeStep(i)}>
                          <Trash className="h-4 w-4 text-destructive" />
                        </Button>
                        
                        <div className="flex gap-4 items-end">
                          <div className="w-1/3">
                            <label className="text-sm font-medium mb-1 block">Aguardar (minutos)</label>
                            <Input type="number" value={step.delayMinutes} onChange={e => updateStep(i, "delayMinutes", parseInt(e.target.value))} />
                          </div>
                          <div className="flex-1">
                            <label className="text-sm font-medium mb-1 block">Ação</label>
                            <Select value={step.action.type} onValueChange={v => updateStepAction(i, v)}>
                              <SelectTrigger><SelectValue/></SelectTrigger>
                              <SelectContent>
                                {Object.entries(ACTION_LABELS).map(([val, label]) => (
                                  <SelectItem key={val} value={val}>{label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                          {step.action.type === "contact.add_tag" ? (
                            <div className="col-span-2">
                              <label className="text-xs">Tag ID</label>
                              <Input value={step.action.params.tagId || ""} onChange={e => updateStepActionParam(i, "tagId", e.target.value)} />
                            </div>
                          ) : step.action.type === "send_message" ? (
                            <div className="col-span-2">
                              <label className="text-xs">Mensagem</label>
                              <Input value={step.action.params.text || ""} onChange={e => updateStepActionParam(i, "text", e.target.value)} />
                            </div>
                          ) : (
                            <div className="col-span-2 text-xs text-muted-foreground italic">Parâmetros extras, se houver, vão aqui.</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </TabsContent>

          <TabsContent value="history" className="flex-1 m-0">
            {initial.id && <HistoryPanel sequenceId={initial.id} />}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
