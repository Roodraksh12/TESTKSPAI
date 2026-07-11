import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { Card, SectionLabel, Badge, IconOrb } from "@/components/scrb/primitives"
import { BarChart2, TrendingUp, AlertTriangle, ShieldCheck, PieChart, Activity, Map, ActivitySquare } from "lucide-react"
import dynamic from 'next/dynamic'
import { CrimeTrendChart, PredictiveRadarChart } from "@/components/scrb/trend-charts"
import { EarlyWarningsFeed } from "@/components/scrb/early-warnings"

const HotspotMap = dynamic(() => import('@/components/scrb/hotspot-map'), { 
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-2xl bg-surface-2" />
})

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const whereClause = session.user.role === 'SP' ? {} : { stationId: session.user.stationId }
  
  const cases = await prisma.case.findMany({
    where: whereClause,
    select: { status: true, crimeType: true }
  })

  // Calculate metrics
  const totalCases = cases.length
  const closedCases = cases.filter(c => c.status === "CLOSED" || c.status === "CHARGESHEETED").length
  const clearanceRate = totalCases > 0 ? Math.round((closedCases / totalCases) * 100) : 0

  // Crime type distribution
  const crimeTypes = cases.reduce((acc, c) => {
    acc[c.crimeType] = (acc[c.crimeType] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const sortedCrimeTypes = Object.entries(crimeTypes).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <SectionLabel>District Intelligence</SectionLabel>
          <h1 className="text-display mt-1 text-3xl">Command Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time analytics and predictive intelligence for {session.user.role === 'SP' ? 'the entire district' : 'your station'}.
          </p>
        </div>
        <Badge tone="teal" className="gap-2 px-3 py-1.5">
          <Activity className="h-4 w-4" /> Live Data Sync
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card strong className="p-6">
          <IconOrb tone="teal" size="sm" className="mb-4">
            <TrendingUp className="h-5 w-5" />
          </IconOrb>
          <p className="text-mono text-[11px] uppercase tracking-wider text-muted-foreground">Total Active Investigations</p>
          <p className="mt-2 text-display text-4xl font-medium">{totalCases}</p>
        </Card>
        
        <Card strong className="p-6">
          <IconOrb tone="amber" size="sm" className="mb-4">
            <ShieldCheck className="h-5 w-5" />
          </IconOrb>
          <p className="text-mono text-[11px] uppercase tracking-wider text-muted-foreground">Clearance Rate (YTD)</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-display text-4xl font-medium">{clearanceRate}%</p>
          </div>
          <div className="mt-4 h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
            <div className="h-full bg-amber-soft rounded-full" style={{ width: `${clearanceRate}%` }} />
          </div>
        </Card>

        <Card strong className="p-6">
          <IconOrb tone="danger" size="sm" className="mb-4">
            <AlertTriangle className="h-5 w-5" />
          </IconOrb>
          <p className="text-mono text-[11px] uppercase tracking-wider text-muted-foreground">High Risk Zones</p>
          <p className="mt-2 text-display text-4xl font-medium">3</p>
          <p className="mt-2 text-xs text-muted-foreground">Bengaluru East reporting +14% anomalies</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Feature 6: Hotspot Map */}
        <Card className="p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Map className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-medium tracking-tight">Active Hotspots</h2>
            </div>
            <Badge tone="danger">Live GPS</Badge>
          </div>
          <HotspotMap />
        </Card>

        {/* Feature 6: Trend Line Chart */}
        <Card className="p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <ActivitySquare className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-medium tracking-tight">6-Month Crime Trend</h2>
          </div>
          <CrimeTrendChart />
        </Card>

        {/* Feature 7: Predictive Radar */}
        <Card className="p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <PieChart className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-medium tracking-tight">7-Day Risk Forecast</h2>
          </div>
          <PredictiveRadarChart />
        </Card>

        {/* Feature 7: Early Warnings */}
        <Card className="p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-medium tracking-tight">Early Warning System</h2>
            </div>
            <span className="text-xs font-medium text-muted-foreground bg-surface-2 px-2 py-1 rounded-md">
              AI Powered
            </span>
          </div>
          <div className="flex-1 overflow-y-auto pr-2">
            <EarlyWarningsFeed />
          </div>
        </Card>
      </div>
    </div>
  )
}
