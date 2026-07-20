import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Briefcase, TrendingUp, AlertTriangle, ShieldAlert, ShieldCheck, Clock, GitMerge,
  FileText, MapPin, Activity, MessageSquare, ChevronRight, ArrowRight,
} from "lucide-react";
import { apiRequest } from "@/api/client";
import { Card, SectionLabel, StatCard, Badge, Skeleton } from "@/components/scrb/primitives";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { DashboardOfficer, DashboardAttention } from "./DashboardClient";

type RecentCase = {
  id: string;
  firNumber: string;
  crimeType: string;
  status: string;
  reportedDate: string;
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "text-teal",
  UNDER_INVESTIGATION: "text-amber",
  CHARGESHEETED: "text-muted-foreground",
  CLOSED: "text-muted-foreground",
};

const ROLE_KEY: Record<string, string> = {
  SP: "role.SP",
  INSPECTOR: "role.INSPECTOR",
  CONSTABLE: "role.CONSTABLE",
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export default function Overview() {
  const { t } = useI18n();
  const [officer, setOfficer] = useState<DashboardOfficer | null>(null);
  const [attention, setAttention] = useState<DashboardAttention | null>(null);
  const [stats, setStats] = useState({ totalCases: 0, clearanceRate: 0, highRiskAlerts: 0, openCases: 0 });
  const [recentCases, setRecentCases] = useState<RecentCase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiRequest("/api/dashboard")
      .then((payload) => {
        if (cancelled) return;
        setOfficer(payload.officer ?? null);
        setAttention(payload.attention ?? null);
        setStats(payload.stats ?? stats);
        setRecentCases(payload.recentCases || []);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attentionRows = attention
    ? [
        { key: "overdue", icon: ShieldAlert, label: t("dash.chargesheetLapsed"), value: attention.overdue, to: "/deadlines", tone: "danger" as const },
        { key: "urgent", icon: Clock, label: t("dash.dueWithin15"), value: attention.urgent, to: "/deadlines", tone: "amber" as const },
        { key: "matches", icon: GitMerge, label: t("dash.leadsAwaiting"), value: attention.pendingMatches, to: "/cases", tone: "amber" as const },
        { key: "zones", icon: AlertTriangle, label: t("dash.highRiskZones"), value: attention.highRiskAlerts, to: "/hotspots", tone: "muted" as const },
      ].filter((r) => r.value > 0)
    : [];

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8">
      {/* Identity + scope */}
      <Card accent="teal" className="p-6">
        {loading && !officer ? (
          <Skeleton className="h-16 rounded-2xl" />
        ) : officer ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-ink text-sm font-bold text-white dark:bg-foreground dark:text-background">
                {initialsOf(officer.name)}
              </div>
              <div className="min-w-0">
                <h1 className="text-display text-2xl leading-tight">{officer.name}</h1>
                <p className="text-mono text-[11px] text-muted-foreground">
                  {officer.badgeId} · {t(ROLE_KEY[officer.role] || "") || officer.role}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="muted">{officer.stationName || "—"}</Badge>
              <Badge tone="muted">{officer.districtName || "—"}</Badge>
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-teal/[0.08] px-2.5 py-1.5 text-[11px] text-teal">
                <ShieldCheck className="h-3 w-3" />
                {t("dash.dataVisible")}: <span className="font-medium">{officer.scopeLabel}</span>
              </span>
            </div>
          </div>
        ) : null}
      </Card>

      {/* Needs attention — the only block with legal clocks behind it */}
      <Card accent={attentionRows.length > 0 ? "danger" : "default"} className="p-6">
        <div className="mb-3 flex items-center justify-between">
          <SectionLabel>{t("dash.needsAttention")}</SectionLabel>
          {attention && attention.overdue > 0 && <Badge tone="danger">{t("dash.actionDue")}</Badge>}
        </div>
        {loading && !attention ? (
          <Skeleton className="h-20 rounded-2xl" />
        ) : attentionRows.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t("dash.nothingPending")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {attentionRows.map((row) => (
              <Link
                key={row.key}
                to={row.to}
                className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface px-3 py-2.5 transition-colors hover:bg-muted"
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    row.tone === "danger" && "bg-danger/10 text-danger",
                    row.tone === "amber" && "bg-amber/10 text-amber",
                    row.tone === "muted" && "bg-surface-2 text-muted-foreground"
                  )}
                >
                  <row.icon className="h-4 w-4" />
                </div>
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{row.label}</span>
                <span
                  className={cn(
                    "text-lg font-bold tabular-nums",
                    row.tone === "danger" && "text-danger",
                    row.tone === "amber" && "text-amber",
                    row.tone === "muted" && "text-muted-foreground"
                  )}
                >
                  {row.value}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Workload */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Briefcase} label={t("dash.openInvestigations")} value={loading ? "—" : stats.openCases} tone="teal" />
        <StatCard icon={TrendingUp} label={t("dash.clearanceRate")} value={loading ? "—" : `${stats.clearanceRate}%`} tone="default" />
        <StatCard icon={Activity} label={t("dash.totalCases")} value={loading ? "—" : stats.totalCases} tone="default" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Recent cases */}
        <Card className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <SectionLabel>{t("dash.recentCases")}</SectionLabel>
            <Link to="/cases" className="text-[11px] font-medium text-teal hover:text-teal/80">
              {t("dash.viewAll")}
            </Link>
          </div>
          {loading && recentCases.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-xl" />
              ))}
            </div>
          ) : recentCases.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{t("dash.noRecentCases")}</p>
          ) : (
            <div className="space-y-1.5">
              {recentCases.map((c) => (
                <Link
                  key={c.id}
                  to={`/cases/${c.id}`}
                  className="group flex items-center gap-3 rounded-2xl border border-hairline bg-surface px-3 py-2.5 transition-colors hover:bg-muted"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted-foreground">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-mono truncate text-[12px] font-medium text-foreground">{c.firNumber}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{c.crimeType}</p>
                  </div>
                  <span className={cn("shrink-0 text-[10px] font-medium", STATUS_COLORS[c.status] || "text-muted-foreground")}>
                    {c.status.replace("_", " ")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Quick actions */}
        <Card className="p-6">
          <SectionLabel className="mb-3">{t("dash.quickActions")}</SectionLabel>
          <div className="space-y-1.5">
            {[
              { to: "/dashboard", icon: MessageSquare, label: t("copilot.title"), tone: "teal" },
              { to: "/fir/upload", icon: FileText, label: t("dash.newFirIntake"), tone: "amber" },
              { to: "/hotspots", icon: MapPin, label: t("dash.viewHotspots"), tone: "teal" },
              { to: "/network", icon: Activity, label: t("dash.entityNetwork"), tone: "muted" },
            ].map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-surface-2"
              >
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg",
                    action.tone === "amber" && "bg-amber/10 text-amber",
                    action.tone === "teal" && "bg-teal/10 text-teal",
                    action.tone === "muted" && "bg-surface-2 text-muted-foreground"
                  )}
                >
                  <action.icon className="h-4 w-4" />
                </div>
                <span className="flex-1 text-[13px] font-medium text-foreground">{action.label}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-hairline bg-surface-2 p-3 text-center">
            <p className="text-[9px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
              {t("dash.securedSession")}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">{t("dash.auditLogged")}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
