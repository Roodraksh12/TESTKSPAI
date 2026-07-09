import { AlertTriangle, MapPin, Clock, ArrowRight } from "lucide-react"

const WARNINGS = [
  {
    id: 1,
    type: "Vehicle Theft Spike",
    probability: 78,
    location: "Sector 4, ITPL Parking",
    timeframe: "Next 48 Hours",
    reasoning: "AI detected a 40% historical match with similar pre-festival theft patterns in this cluster.",
    action: "Increase Night Patrol (22:00 - 02:00)",
    urgency: "high"
  },
  {
    id: 2,
    type: "Burglary Network Active",
    probability: 65,
    location: "Koramangala Block 5",
    timeframe: "Weekend (Sat-Sun)",
    reasoning: "Two known associates of the 'X' gang were flagged by ALPR entering the zone.",
    action: "Deploy plainclothes units",
    urgency: "medium"
  },
  {
    id: 3,
    type: "Cyber Fraud Vector",
    probability: 85,
    location: "Jurisdiction-wide",
    timeframe: "Next 7 Days",
    reasoning: "New SMS phishing template detected bypassing local carrier filters.",
    action: "Issue public advisory via social channels",
    urgency: "high"
  }
]

export function EarlyWarningsFeed() {
  return (
    <div className="space-y-4">
      {WARNINGS.map((warn) => (
        <div key={warn.id} className="group relative flex flex-col gap-3 rounded-2xl border border-hairline bg-surface p-4 transition hover:border-foreground/20">
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full ${warn.urgency === 'high' ? 'bg-danger/10 text-danger' : 'bg-amber-500/10 text-amber-600'}`}>
                <AlertTriangle className="h-4 w-4" />
              </div>
              <h3 className="font-semibold tracking-tight text-foreground">{warn.type}</h3>
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
            <strong className="text-foreground">AI Reasoning:</strong> {warn.reasoning}
          </p>

          <div className="mt-2 flex items-center justify-between rounded-xl bg-surface-2 p-3">
            <div className="text-xs font-medium text-foreground">
              <span className="text-muted-foreground mr-1">Recommended:</span> {warn.action}
            </div>
            <button className="text-muted-foreground hover:text-foreground">
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
