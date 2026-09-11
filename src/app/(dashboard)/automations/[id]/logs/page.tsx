"use client"

import { use } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"

export default function AutomationLogsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()

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
          <h1 className="text-2xl font-bold text-foreground">Logs (Coming Soon)</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Automation logs are being migrated to the new Zenith engine.</p>
        </div>
      </div>
      
      <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40">
        <p className="text-sm text-foreground">Logs currently unavailable.</p>
      </div>
    </div>
  )
}
