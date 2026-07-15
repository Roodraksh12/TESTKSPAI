import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { DashboardClient } from "./DashboardClient"
import { Suspense } from "react"

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    redirect("/login")
  }

  const whereClause = session.user.role === 'SP' ? {} : { stationId: session.user.stationId }

  const [totalCases, alertCount, recentCases] = await Promise.all([
    prisma.case.count({ where: whereClause }),
    prisma.alert.count({ where: { ...whereClause, riskScore: { gte: 70 } } }),
    prisma.case.findMany({
      where: whereClause,
      orderBy: { reportedDate: "desc" },
      take: 5,
      select: {
        id: true,
        firNumber: true,
        crimeType: true,
        status: true,
        reportedDate: true,
      },
    }),
  ])

  return (
    <Suspense fallback={
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-hairline border-t-ink rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading command center...</p>
        </div>
      </div>
    }>
      <DashboardClient
        totalCases={totalCases}
        alertCount={alertCount}
        recentCases={recentCases.map(c => ({
          ...c,
          reportedDate: c.reportedDate.toISOString(),
        }))}
      />
    </Suspense>
  )
}
