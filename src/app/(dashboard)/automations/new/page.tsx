"use client"

import { Suspense, useMemo } from "react"
import { useSearchParams } from "next/navigation"

import {
  AutomationBuilderZenith,
  type BuilderInitialZenith,
} from "@/components/automations/automation-builder-zenith"

import type { AutomationTriggerType } from "@/types"

// `useSearchParams` requires a Suspense boundary or the production build
// bails to CSR and errors out. Thin wrapper supplies it; the inner
// component reads the `?template=` query string.
export default function NewAutomationPage() {
  return (
    <Suspense fallback={null}>
      <NewAutomationPageInner />
    </Suspense>
  )
}

function NewAutomationPageInner() {
  const params = useSearchParams()

  const initial: BuilderInitialZenith = useMemo(() => {
    return {
      name: "",
      description: "",
      triggerType: "message.received" as AutomationTriggerType,
      triggerConfig: {},
      status: "draft",
      conditions: [],
      actions: [],
    }
  }, [])

  return <AutomationBuilderZenith initial={initial} />
}

