"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { AutomationTriggerType } from "@/types"

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

export function AutomationBuilderZenith({ initial }: { initial: BuilderInitialZenith }) {
  const router = useRouter()
  const isEditing = !!initial.id
  const [state, setState] = useState<BuilderInitialZenith>(initial)
  const [saving, setSaving] = useState(false)
  const [conditionsJson, setConditionsJson] = useState(() => JSON.stringify(initial.conditions || [], null, 2))
  const [actionsJson, setActionsJson] = useState(() => JSON.stringify(initial.actions || [], null, 2))
  const [triggerConfigJson, setTriggerConfigJson] = useState(() => JSON.stringify(initial.triggerConfig || {}, null, 2))

  function patchTop<K extends keyof BuilderInitialZenith>(key: K, value: BuilderInitialZenith[K]) {
    setState((s) => ({ ...s, [key]: value }))
  }

  async function save() {
    setSaving(true)
    try {
      let conditionsParsed = []
      let actionsParsed = []
      let triggerConfigParsed = {}

      try {
        conditionsParsed = JSON.parse(conditionsJson)
        actionsParsed = JSON.parse(actionsJson)
        triggerConfigParsed = JSON.parse(triggerConfigJson)
      } catch (e: any) {
        toast.error("Invalid JSON format in conditions, actions, or trigger config")
        setSaving(false)
        return
      }

      const payload = {
        name: state.name || "Untitled automation",
        description: state.description || null,
        triggerType: state.triggerType,
        triggerConfig: triggerConfigParsed,
        status: state.status,
        conditions: conditionsParsed,
        actions: actionsParsed,
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
        toast.error(body?.error ?? "Failed to save")
        return
      }
      toast.success(isEditing ? "Saved" : "Created")
      if (!isEditing && body?.id) {
        router.replace(`/automations/${body.id}/edit`)
      }
    } finally {
      setSaving(false)
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
          placeholder="Untitled"
          className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:bg-muted focus:outline-none sm:text-base"
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline">Active</span>
          <Switch
            checked={state.status === "active"}
            onCheckedChange={(v) => patchTop("status", v ? "active" : "paused")}
          />
        </div>
        <Button
          onClick={save}
          disabled={saving}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {isEditing ? "Save" : "Save Draft"}
        </Button>
      </header>

      <div className="relative flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-3xl space-y-8">
          
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">Trigger</h2>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Trigger Type</label>
              <select 
                value={state.triggerType}
                onChange={(e) => patchTop("triggerType", e.target.value as any)}
                className="w-full mt-1 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="new_message_received">new_message_received</option>
                <option value="deal.created">deal.created</option>
                <option value="deal.stage_changed">deal.stage_changed</option>
                <option value="deal.won">deal.won</option>
                <option value="deal.lost">deal.lost</option>
                <option value="task.completed">task.completed</option>
                <option value="contact.created">contact.created</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Trigger Config (JSON)</label>
              <Textarea 
                value={triggerConfigJson}
                onChange={(e) => setTriggerConfigJson(e.target.value)}
                className="mt-1 font-mono text-sm h-32"
              />
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">Conditions</h2>
            <p className="text-sm text-muted-foreground">Define array of conditions. E.g. `[{'{"subject":"payload.stageId","operand":"==","value":"..."}'}]`</p>
            <Textarea 
              value={conditionsJson}
              onChange={(e) => setConditionsJson(e.target.value)}
              className="font-mono text-sm h-48"
            />
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">Actions</h2>
            <p className="text-sm text-muted-foreground">Define array of actions. E.g. `[{'{"type":"add_tag","tagId":"..."}'}]`</p>
            <Textarea 
              value={actionsJson}
              onChange={(e) => setActionsJson(e.target.value)}
              className="font-mono text-sm h-64"
            />
          </div>

        </div>
      </div>
    </div>
  )
}
