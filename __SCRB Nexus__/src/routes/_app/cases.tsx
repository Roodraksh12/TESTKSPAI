import { createFileRoute, Link } from "@tanstack/react-router";
import { CASES } from "@/lib/scrb/mock";
import { GlassPanel, GlassPill, SectionLabel } from "@/components/scrb/primitives";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/_app/cases")({
  head: () => ({ meta: [{ title: "Cases — SCRB Sahayak" }] }),
  component: CasesIndex,
});

function CasesIndex() {
  return (
    <GlassPanel strong className="p-6 sm:p-8">
      <SectionLabel>All Cases</SectionLabel>
      <h1 className="text-display mt-1 text-3xl">Active investigations</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {CASES.length} cases across your jurisdiction. Select one to open its dossier.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {CASES.map((c) => (
          <Link
            key={c.id}
            to="/cases/$caseId"
            params={{ caseId: c.id }}
            className="glass rounded-3xl p-5 transition-all duration-300 hover:-translate-y-0.5 hover:brightness-125"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-mono text-[11px] tracking-wider text-muted-foreground">{c.firNumber}</p>
                <p className="text-display mt-1 text-lg">{c.title}</p>
              </div>
              <GlassPill tone={c.status === "Active" ? "teal" : c.status === "Under Review" ? "amber" : "muted"}>
                {c.status}
              </GlassPill>
            </div>
            <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{c.summary}</p>
            <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" />{c.crimeType}</span>
              <span className="text-mono">{c.date}</span>
            </div>
          </Link>
        ))}
      </div>
    </GlassPanel>
  );
}
