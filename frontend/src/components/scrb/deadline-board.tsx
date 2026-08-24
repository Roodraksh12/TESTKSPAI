import { Link } from "react-router-dom";
import { AlertTriangle, Clock, FileCheck2, ShieldAlert, TrendingUp } from "lucide-react";
import { Badge, Card } from "@/components/scrb/primitives";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type Clock = {
  windowDays: number;
  dueDate: string;
  daysLeft: number;
  elapsedDays: number;
  tier: string;
  statute: string;
  consequence: string;
  personName?: string;
  filingStatus?: "NOT_FILED" | "FILED_IN_TIME" | "FILED_AFTER_WINDOW";
};

export type DeadlineRow = {
  caseId: string;
  firNumber: string;
  crimeType: string;
  status: string;
  grave: boolean;
  tier: string;
  chargesheetStatus: string;
  chargesheet: Clock | null;
  custodyClocks: Clock[];
  victim: Clock;
};

export type DeadlineSummary = Record<string, number>;

const TIER_TONE: Record<string, "danger" | "amber" | "teal" | "muted"> = {
  OVERDUE: "danger",
  URGENT: "danger",
  WATCH: "amber",
  ON_TRACK: "teal",
  COMPLIANT: "muted",
  NOT_STARTED: "muted",
};

const TIER_KEY: Record<string, string> = {
  OVERDUE: "deadlines.overdue",
  URGENT: "deadlines.urgent",
  WATCH: "deadlines.watch",
  ON_TRACK: "deadlines.onTrack",
  COMPLIANT: "deadlines.filed",
  NOT_STARTED: "deadlines.notStarted",
};

const SUMMARY_TILES: { key: string; labelKey: string; icon: typeof Clock; tone: "danger" | "amber" | "teal" | "muted" }[] = [
  { key: "OVERDUE", labelKey: "deadlines.overdue", icon: ShieldAlert, tone: "danger" },
  { key: "URGENT", labelKey: "deadlines.urgent", icon: AlertTriangle, tone: "danger" },
  { key: "WATCH", labelKey: "deadlines.watch", icon: Clock, tone: "amber" },
  { key: "ON_TRACK", labelKey: "deadlines.onTrack", icon: TrendingUp, tone: "teal" },
  { key: "COMPLIANT", labelKey: "deadlines.filed", icon: FileCheck2, tone: "muted" },
  { key: "NOT_STARTED", labelKey: "deadlines.notStarted", icon: Clock, tone: "muted" },
];

export function DeadlineSummaryTiles({ summary }: { summary: DeadlineSummary }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {SUMMARY_TILES.map(({ key, labelKey, icon: Icon, tone }) => (
        <Card key={key} accent={tone === "muted" ? "default" : tone} className="p-4">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              tone === "danger" && "bg-danger/10 text-danger",
              tone === "amber" && "bg-amber/10 text-amber",
              tone === "teal" && "bg-teal/10 text-teal",
              tone === "muted" && "bg-surface-2 text-muted-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{summary[key] ?? 0}</p>
          <p className="text-[11px] font-medium text-muted-foreground">{t(labelKey)}</p>
        </Card>
      ))}
    </div>
  );
}

function ClockProgress({ clock, label = "Remand" }: { clock: Clock; label?: string }) {
  const pct = Math.min(100, Math.max(0, Math.round((clock.elapsedDays / clock.windowDays) * 100)));
  const dayLabel = `${label} day ${clock.elapsedDays} of ${clock.windowDays}`;
  const countdown =
    clock.daysLeft < 0
      ? `${Math.abs(clock.daysLeft)} day${Math.abs(clock.daysLeft) === 1 ? "" : "s"} overdue`
      : `${clock.daysLeft} day${clock.daysLeft === 1 ? "" : "s"} remaining`;

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="text-mono">{dayLabel}</span>
        <span className={cn("font-medium", clock.tier === "OVERDUE" ? "text-danger" : clock.tier === "URGENT" ? "text-amber" : "text-muted-foreground")}>
          {countdown}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            clock.tier === "OVERDUE" ? "bg-danger" : clock.tier === "URGENT" ? "bg-danger" : clock.tier === "WATCH" ? "bg-amber" : "bg-teal"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function DeadlineRiskList({ board, onOpenEditor }: { board: DeadlineRow[]; onOpenEditor?: (id: string) => void }) {
  const { t } = useI18n();
  if (board.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-hairline bg-surface-2 text-sm text-muted-foreground">
        {t("deadlines.noCases")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {board.map((row) => (
        <Card key={row.caseId} className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TIER_TONE[row.tier] || "muted"}>{TIER_KEY[row.tier] ? t(TIER_KEY[row.tier]) : row.tier}</Badge>
                <Link to={`/cases/${row.caseId}`} className="text-mono text-sm font-medium text-foreground hover:text-teal transition-colors">
                  {row.firNumber}
                </Link>
                <span className="text-xs text-muted-foreground">{row.crimeType}</span>
                {row.chargesheet?.windowDays === 90 && <Badge tone="danger">{t("deadlines.grave")}</Badge>}
              </div>
            </div>
            {row.chargesheet && row.chargesheet.filingStatus === "NOT_FILED" && row.tier !== "COMPLIANT" && (
              onOpenEditor ? (
                <button
                  type="button"
                  onClick={() => onOpenEditor(row.caseId)}
                  className="shrink-0 rounded-lg bg-ink px-4 py-2 text-xs font-medium text-white hover:bg-ink/90 transition-colors shadow-sm"
                >
                  {t("deadlines.draftChargesheet")}
                </button>
              ) : (
                <Link
                  to={`/cases/${row.caseId}/chargesheet`}
                  className="shrink-0 rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                >
                  {t("deadlines.draftChargesheet")}
                </Link>
              )
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {row.chargesheet ? (
              <div>
                <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase mb-1.5">
                  {t("deadlines.chargeSheetFiling")} · {row.chargesheet.statute}
                </p>
                <p className="mb-1.5 text-[11px] text-muted-foreground">
                  {row.chargesheet.personName ? `Accused: ${row.chargesheet.personName} · ` : ""}
                  {row.chargesheet.windowDays}-day window
                </p>
                <ClockProgress clock={row.chargesheet} />
                {row.tier === "OVERDUE" && (
                  <p className="mt-1.5 text-[11px] text-danger">{row.chargesheet.consequence}.</p>
                )}
              </div>
            ) : (
              <div className="rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-muted-foreground">
                {row.chargesheetStatus === "LEGACY_CASE_COMPLETED"
                  ? "No first-remand record is available for this completed case."
                  : "No first remand recorded. FIR registration does not start a BNSS 187(3) custody clock."}
              </div>
            )}
            <div>
              <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase mb-1.5">
                {t("deadlines.victimUpdate")} · {row.victim.statute}
              </p>
              <ClockProgress clock={row.victim} label="FIR" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
