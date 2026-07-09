import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { ChatPanel } from "@/components/scrb/chat"
import { CaseLedger } from "@/components/scrb/case-ledger"

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    redirect("/login")
  }

  const stationCases = await prisma.case.findMany({
    where: { stationId: session.user.stationId },
    orderBy: { reportedDate: "desc" },
    take: 20,
    include: {
      casePersons: {
        include: { person: true }
      }
    }
  })

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_0.6fr]">
      <ChatPanel />
      <CaseLedger cases={stationCases} />
    </div>
  )
}
