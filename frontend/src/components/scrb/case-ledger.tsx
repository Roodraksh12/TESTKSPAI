import { Link } from "react-router-dom";
import { Clock, FileText, MapPin } from "lucide-react";
import { Badge } from "./primitives";
import { cn } from "@/lib/utils";

type CaseStatus = "Active" | "Under Review" | "Cold" | "Closed";

const STATUS_TONE: Record<CaseStatus, "teal" | "amber" | "muted" | "danger"> = {
  Active: "teal",
  "Under Review": "amber",
  Cold: "muted",
  Closed: "muted",
};

export function CaseLedger({ compact = false, cases = [] }: { compact?: boolean, cases?: any[] }) {
  return (
    <div className="bg-surface flex h-[calc(100vh-13rem)] min-h-[560px] flex-col rounded-3xl p-5 min-w-0 border border-hairline shadow-sm">
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            Case Ledger
          </p>
          <p className="mt-0.5 text-lg font-semibold tracking-tight text-foreground">Assigned to you</p>
        </div>
        <Badge tone="muted">{cases.length} cases</Badge>
      </div>
      <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1 custom-scrollbar">
        {cases.map((c) => <CaseCard key={c.id} c={c} compact={compact} />)}
      </div>
    </div>
  );
}

export function CaseCard({ c, compact }: { c: any; compact?: boolean }) {
  // Handle both Mock CaseRecord and Prisma Case
  const firNumber = c.firNumber;
  const title = c.title || (c.summary ? c.summary.split('.')[0] : "Investigation Case");
  const crimeType = c.crimeType;
  
  // Status mapping
  let statusText = c.status;
  let statusTone: "teal" | "amber" | "muted" | "danger" = "muted";
  
  if (typeof c.status === "string" && STATUS_TONE[c.status as CaseStatus]) {
    statusTone = STATUS_TONE[c.status as CaseStatus];
  } else if (c.status === "OPEN" || c.status === "UNDER_INVESTIGATION") {
    statusText = c.status.replace("_", " ");
    statusTone = "teal";
  } else if (c.status === "CHARGESHEETED") {
    statusText = "Charge Sheeted";
    statusTone = "amber";
  }
  
  const dateStr =
    c.date ||
    (c.reportedDate
      ? new Date(c.reportedDate).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "");
  const stationName = typeof c.station === "string" ? c.station : c.station?.name || "Your Station";

  return (
    <Link
      to={`/cases/${c.id}`}
      className={cn(
        "group block rounded-2xl border border-hairline bg-surface p-4 transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-mono text-[11px] tracking-wider text-muted-foreground">{firNumber}</p>
          <p className="mt-1 truncate text-sm font-medium">{title}</p>
        </div>
        <Badge tone={statusTone}>{statusText}</Badge>
      </div>
      {!compact && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" />{crimeType}</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{dateStr}</span>
          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{stationName}</span>
        </div>
      )}
    </Link>
  );
}
