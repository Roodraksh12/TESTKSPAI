import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { ShieldAlert } from "lucide-react"
import CaseDossierClient from "./client"

export default async function CaseDossierPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const caseData = await prisma.case.findUnique({
    where: { id: params.id },
    include: {
      station: true,
      casePersons: { include: { person: true } },
      matches: { include: { matchedCase: true, matchedPerson: true } }
    }
  })

  if (!caseData || (session.user.role !== 'SP' && caseData.stationId !== session.user.stationId)) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center p-6">
        <div className="text-center space-y-4 glass p-12 rounded-3xl">
          <ShieldAlert className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="text-2xl font-medium text-foreground tracking-tight">Case not found or access denied.</h2>
        </div>
      </div>
    )
  }

  return <CaseDossierClient caseData={caseData} />
}
