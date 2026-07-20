import { AlertTriangle, MapPin, Clock, ArrowRight } from "lucide-react"

export type EarlyWarning = {
  type: string
  probability: number
  location: string
  timeframe: string
  reasoning: string
  action: string
  urgency: string
}

const TYPE_LABEL: Record<string, string> = {
  HOTSPOT: "Hotspot Alert",
  ANOMALY: "Crime Velocity Spike",
  DEADLINE: "Statutory Deadline Risk",
}

export function EarlyWarningsFeed({ warnings = [] }: { warnings?: EarlyWarning[] }) {
  if (warnings.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-hairline bg-surface-2">
        <p className="text-sm text-muted-foreground">No active warnings for your jurisdiction.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {warnings.map((warn, i) => (
        <div key={i} className="group relative flex flex-col gap-3 rounded-2xl border border-hairline bg-surface p-4 transition hover:border-foreground/20">

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full ${warn.urgency === 'high' ? 'bg-danger/10 text-danger' : 'bg-amber-500/10 text-amber-600'}`}>
                <AlertTriangle className="h-4 w-4" />
              </div>
              <h3 className="font-semibold tracking-tight text-foreground">{TYPE_LABEL[warn.type] || warn.type}</h3>
            </div>
            <div className={`px-2 py-1 rounded-md text-xs font-medium ${warn.urgency === 'high' ? 'bg-danger text-white' : 'bg-amber-100 text-amber-800'}`}>
              {warn.probability}% Prob.
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground mt-1">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {warn.location}
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {warn.timeframe}
            </div>
          </div>

          <p className="text-[13px] leading-relaxed text-muted-foreground">
            <strong className="text-foreground">Reasoning:</strong> {warn.reasoning}
          </p>

          <div className="mt-2 flex items-center justify-between rounded-xl bg-surface-2 p-3">
            <div className="text-xs font-medium text-foreground">
              <span className="text-muted-foreground mr-1">Recommended:</span> {warn.action}
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      ))}
    </div>
  )
}
