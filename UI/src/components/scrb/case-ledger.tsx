import { Link } from "@tanstack/react-router";
import { Clock, FileText, MapPin } from "lucide-react";
import { CASES, type CaseRecord, type CaseStatus } from "@/lib/scrb/mock";
import { GlassPill } from "./primitives";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<CaseStatus, "teal" | "amber" | "muted" | "danger"> = {
  Active: "teal",
  "Under Review": "amber",
  Cold: "muted",
  Closed: "muted",
};

export function CaseLedger({ compact = false }: { compact?: boolean }) {
  return (
    <div className="glass flex h-[calc(100vh-13rem)] min-h-[560px] flex-col rounded-3xl p-5">
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            Case Ledger
          </p>
          <p className="mt-0.5 text-lg font-semibold tracking-tight">Assigned to you</p>
        </div>
        <GlassPill tone="muted">{CASES.length} cases</GlassPill>
      </div>
      <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
        {CASES.map((c) => <CaseCard key={c.id} c={c} compact={compact} />)}
      </div>
    </div>
  );
}

export function CaseCard({ c, compact }: { c: CaseRecord; compact?: boolean }) {
  return (
    <Link
      to="/cases/$caseId"
      params={{ caseId: c.id }}
      className={cn(
        "group block rounded-2xl border border-hairline bg-surface p-4 transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-mono text-[11px] tracking-wider text-muted-foreground">{c.firNumber}</p>
          <p className="mt-1 truncate text-sm font-medium">{c.title}</p>
        </div>
        <GlassPill tone={STATUS_TONE[c.status]}>{c.status}</GlassPill>
      </div>
      {!compact && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" />{c.crimeType}</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{c.date}</span>
          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{c.station}</span>
        </div>
      )}
    </Link>
  );
}
