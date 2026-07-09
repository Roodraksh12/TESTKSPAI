import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import TacticalView from "./TacticalView"

export default async function TacticalModePage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const caseData = await prisma.case.findUnique({
    where: { id: params.id },
    include: {
      casePersons: { include: { person: true } },
      matches: { include: { matchedCase: true, matchedPerson: true } }
    }
  })

  if (!caseData || (session.user.role !== 'SP' && caseData.stationId !== session.user.stationId)) {
    return <div className="p-8 text-center text-white bg-slate-900 h-screen">Access Denied.</div>
  }

  return <TacticalView caseData={caseData} />
}
