import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { Card, SectionLabel, Badge, StatCard } from "@/components/scrb/primitives"
import { TrendingUp, AlertTriangle, ShieldCheck, PieChart, Activity, Map, ActivitySquare } from "lucide-react"
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
          <SectionLabel className="mb-2">District Intelligence</SectionLabel>
          <h1 className="text-display text-3xl">Command Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time analytics and predictive intelligence for {session.user.role === 'SP' ? 'the entire district' : 'your station'}.
          </p>
        </div>
        <Badge tone="teal" className="gap-2 px-3 py-1.5">
          <Activity className="h-4 w-4" /> Live Data Sync
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card accent="teal" className="p-5">
          <StatCard icon={TrendingUp} label="Total Active Investigations" value={totalCases} tone="teal" className="border-none shadow-none p-0" />
        </Card>

        <Card accent="amber" className="p-5">
          <div className="flex flex-col gap-2">
            <StatCard icon={ShieldCheck} label="Clearance Rate (YTD)" value={`${clearanceRate}%`} tone="default" className="border-none shadow-none p-0" />
            <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full bg-amber rounded-full transition-all" style={{ width: `${clearanceRate}%` }} />
            </div>
          </div>
        </Card>

        <Card accent="danger" className="p-5">
          <div className="flex flex-col gap-2">
            <StatCard icon={AlertTriangle} label="High Risk Zones" value="3" tone="danger" className="border-none shadow-none p-0" />
            <p className="text-xs text-muted-foreground px-1">Bengaluru East reporting +14% anomalies</p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        
        {/* Hotspot Map */}
        <Card accent="danger" className="p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-danger/10 text-danger">
                <Map className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-semibold tracking-tight">Active Hotspots</h2>
            </div>
            <Badge tone="danger">Live GPS</Badge>
          </div>
          <HotspotMap />
        </Card>

        {/* Crime Trend */}
        <Card accent="teal" className="p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal/10 text-teal">
              <ActivitySquare className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-semibold tracking-tight">6-Month Crime Trend</h2>
          </div>
          <CrimeTrendChart />
        </Card>

        {/* Risk Forecast */}
        <Card accent="amber" className="p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber/10 text-amber">
              <PieChart className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-semibold tracking-tight">7-Day Risk Forecast</h2>
          </div>
          <PredictiveRadarChart />
        </Card>

        {/* Early Warnings */}
        <Card accent="amber" className="p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber/10 text-amber">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-semibold tracking-tight">Early Warning System</h2>
            </div>
            <span className="text-[10px] font-medium text-muted-foreground bg-surface-2 px-2 py-1 rounded-md">
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
