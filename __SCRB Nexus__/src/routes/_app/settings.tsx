import { createFileRoute } from "@tanstack/react-router";
import { GlassPanel, GlassPill, GlassSelect, SectionLabel } from "@/components/scrb/primitives";
import { useDemoSession } from "@/lib/scrb/session";
import { Scale, ShieldCheck, Globe, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — SCRB Sahayak" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { session, setSession } = useDemoSession();
  return (
    <div className="space-y-6">
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
            <GlassSelect
              value={session?.language ?? "EN"}
              onChange={(e) => session && setSession({ ...session, language: e.target.value as "EN" | "KN" })}
            >
              <option value="EN" className="bg-ink">English</option>
              <option value="KN" className="bg-ink">ಕನ್ನಡ · Kannada</option>
            </GlassSelect>
          </div>
        </GlassPanel>

        <GlassPanel strong className="p-6">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-amber-soft" />
            <SectionLabel>Jurisdiction</SectionLabel>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Restrict queries and results to your assigned station and district.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <GlassPill tone="teal">{session?.district}</GlassPill>
            <GlassPill tone="muted">{session?.station} Station</GlassPill>
            <GlassPill tone="amber">{session?.role}</GlassPill>
          </div>
        </GlassPanel>

        <GlassPanel strong className="p-6 lg:col-span-2">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-teal-soft" />
            <SectionLabel>Audit trail</SectionLabel>
          </div>
          <div className="mt-4 space-y-2">
            {[
              { t: "10:14", d: "Today", label: "Queried linkage between FIR-2026-1042 and FIR-2026-1039" },
              { t: "10:02", d: "Today", label: "Opened dossier c-1039" },
              { t: "18:41", d: "Yesterday", label: "Confirmed match: KA-05-MJ vehicle correlation" },
            ].map((a) => (
              <div key={a.t + a.d} className="glass flex items-center justify-between rounded-2xl px-4 py-2.5 text-sm">
                <span>{a.label}</span>
                <span className="text-mono text-[11px] text-muted-foreground">{a.d} · {a.t}</span>
              </div>
            ))}
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
