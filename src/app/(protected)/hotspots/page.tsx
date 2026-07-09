import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import dynamic from "next/dynamic"
import { AlertTriangle, TrendingUp, TrendingDown } from "lucide-react"
import { GlassPanel, GlassPill, IconOrb, SectionLabel } from "@/components/scrb/primitives"

const HotspotMap = dynamic(() => import("@/components/HotspotMap"), { ssr: false })

export default async function HotspotsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const stationId = session.user.stationId
  
  const alerts = await prisma.alert.findMany({
    where: { stationId },
    orderBy: { riskScore: "desc" }
  })

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
      <GlassPanel strong className="relative overflow-hidden p-6 flex flex-col h-[calc(100vh-10rem)]">
        <SectionLabel>Live Hotspots</SectionLabel>
        <h1 className="text-display mt-1 text-2xl">Risk map</h1>
        <p className="mt-2 text-sm text-muted-foreground">Predictive risk assessment and spatial anomalies.</p>
        
        <div className="relative mt-5 flex-1 w-full overflow-hidden rounded-3xl border border-hairline bg-surface/50">
          <HotspotMap alerts={alerts} />
        </div>
      </GlassPanel>

      <div className="space-y-6">
        <GlassPanel strong className="p-6">
          <SectionLabel>Risk ranking</SectionLabel>
          <div className="mt-4 space-y-3">
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active hotspot alerts for your jurisdiction.</p>
            ) : (
              alerts.map((h) => {
                const isHighRisk = h.riskScore >= 80;
                return (
                  <div key={h.id} className="glass flex items-center gap-3 rounded-2xl p-3">
                    <IconOrb tone={isHighRisk ? "amber" : "teal"} size="sm">
                      <AlertTriangle className="h-3.5 w-3.5" />
                    </IconOrb>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{h.zoneLabel}</p>
                      <p className="text-mono text-[10px] text-muted-foreground truncate">{h.reason}</p>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <GlassPill tone={isHighRisk ? "amber" : "teal"}>{isHighRisk ? "High" : "Elevated"}</GlassPill>
                      <p className={"mt-1 inline-flex items-center gap-1 text-[11px] " + (isHighRisk ? "text-amber-soft" : "text-teal-soft")}>
                        <TrendingUp className="h-3 w-3" />
                        {h.riskScore}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </GlassPanel>

        <GlassPanel strong className="p-6">
          <SectionLabel>7-day trend</SectionLabel>
          <svg viewBox="0 0 200 60" className="mt-4 h-24 w-full">
            <defs>
              <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(46,143,143,0.55)" />
                <stop offset="100%" stopColor="rgba(46,143,143,0)" />
              </linearGradient>
            </defs>
            <path d="M0,45 L28,38 L56,42 L84,25 L112,30 L140,18 L168,22 L200,10 L200,60 L0,60 Z" fill="url(#g)" />
            <path d="M0,45 L28,38 L56,42 L84,25 L112,30 L140,18 L168,22 L200,10" stroke="rgba(117,205,205,0.9)" strokeWidth="1.2" fill="none" />
          </svg>
          <p className="mt-2 text-xs text-muted-foreground">Composite risk index across tracked areas.</p>
        </GlassPanel>
      </div>
    </div>
  )
}
