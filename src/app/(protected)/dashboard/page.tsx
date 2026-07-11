import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"


export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    redirect("/login")
  }

  return (
    <div className="flex h-full flex-col p-6">
      <h1 className="text-2xl font-semibold mb-6">Welcome, {session.user.name}</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass p-6 rounded-xl border border-hairline">
          <h3 className="text-lg font-medium text-foreground mb-2">Active Cases</h3>
          <p className="text-4xl font-bold text-teal-600">24</p>
          <p className="text-sm text-muted-foreground mt-2">3 require immediate attention</p>
        </div>
        <div className="glass p-6 rounded-xl border border-hairline">
          <h3 className="text-lg font-medium text-foreground mb-2">Recent Hotspots</h3>
          <p className="text-4xl font-bold text-amber-500">2</p>
          <p className="text-sm text-muted-foreground mt-2">Indiranagar & Whitefield</p>
        </div>
        <div className="glass p-6 rounded-xl border border-hairline bg-surface-2 border-dashed flex flex-col items-center justify-center text-center">
          <h3 className="text-lg font-medium text-foreground mb-2">Need Assistance?</h3>
          <p className="text-sm text-muted-foreground">Click the ✨ icon in the top right to open the global SCRB Copilot.</p>
        </div>
      </div>
    </div>
  )
}
