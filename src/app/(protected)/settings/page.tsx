import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { GlassPanel, GlassPill, SectionLabel, GlassSelect } from "@/components/scrb/primitives"
import { LanguageSelect } from "@/components/scrb/LanguageSelect"
import { Scale, ShieldCheck, Globe, ClipboardList } from "lucide-react"

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const auditLogs = await prisma.auditLog.findMany({
    where: { officerId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 100
  })

  // Get officer's station and district names if possible
  const officer = await prisma.officer.findUnique({
    where: { id: session.user.id },
    include: { station: { include: { district: true } } }
  })

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8">
      <GlassPanel strong className="p-6 sm:p-8">
        <SectionLabel>Settings</SectionLabel>
        <h1 className="text-display mt-1 text-3xl">Workspace preferences</h1>
        <p className="mt-1 text-sm text-muted-foreground">Language, jurisdiction, audit, and fairness statement.</p>
      </GlassPanel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GlassPanel strong className="p-6">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-teal-soft" />
            <SectionLabel>Language</SectionLabel>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Interface language for menus, prompts and generated summaries.</p>
          <div className="mt-4 max-w-xs">
            <LanguageSelect />
          </div>
        </GlassPanel>

        <GlassPanel strong className="p-6">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-amber-soft" />
            <SectionLabel>Jurisdiction</SectionLabel>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Restrict queries and results to your assigned station and district.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <GlassPill tone="teal">{officer?.station.district.name || "District"}</GlassPill>
            <GlassPill tone="muted">{officer?.station.name || "Station"}</GlassPill>
            <GlassPill tone="amber">{officer?.role || "OFFICER"}</GlassPill>
          </div>
        </GlassPanel>

        <GlassPanel strong className="p-6 lg:col-span-2 flex flex-col max-h-[400px]">
          <div className="flex items-center gap-2 shrink-0">
            <ClipboardList className="h-4 w-4 text-teal-soft" />
            <SectionLabel>Audit trail</SectionLabel>
          </div>
          <div className="mt-4 space-y-2 overflow-y-auto pr-2 custom-scrollbar">
            {auditLogs.length === 0 ? (
              <div className="text-sm text-muted-foreground p-4 text-center">No audit logs found.</div>
            ) : (
              auditLogs.map((log) => {
                const date = new Date(log.createdAt);
                return (
                  <div key={log.id} className="glass flex items-center justify-between rounded-2xl px-4 py-2.5 text-sm gap-4">
                    <span className="flex-1">
                      <strong className="font-medium">{log.action}</strong>
                      {log.details && <span className="text-muted-foreground ml-2">{log.details}</span>}
                    </span>
                    <span className="text-mono text-[11px] text-muted-foreground whitespace-nowrap">
                      {date.toLocaleDateString()} · {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </GlassPanel>

        <GlassPanel strong className="p-6 lg:col-span-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-amber-soft" />
            <SectionLabel>Fairness &amp; oversight</SectionLabel>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-foreground">
            SCRB Sahayak surfaces suggestions to support — never replace — an investigator's judgement. All AI-generated conclusions cite source records and expose a confidence score. No arrest, detention or coercive action may be initiated on an AI suggestion alone; human confirmation is required. Every query, source view and confirmation is written to an immutable audit log accessible to supervisory officers and oversight bodies.
          </p>
        </GlassPanel>
      </div>
    </div>
  );
}
