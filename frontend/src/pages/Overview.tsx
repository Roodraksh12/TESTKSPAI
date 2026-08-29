import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Briefcase, TrendingUp, AlertTriangle, ShieldAlert, ShieldCheck, Clock, GitMerge,
  FileText, MapPin, Activity, MessageSquare, ChevronRight, ArrowRight, Users, KeyRound, UserPlus, Mail,
} from "lucide-react";
import { apiRequest } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { Card, SectionLabel, StatCard, Badge, Skeleton } from "@/components/scrb/primitives";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { DashboardOfficer, DashboardAttention } from "./DashboardClient";
import { useVisibilityRefetch } from "@/hooks/useVisibilityRefetch";
import { DataLoadError } from "@/components/scrb/data-load-state";

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
  POLICE_IT: "role.POLICE_IT",
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function PoliceItOverview() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      apiRequest("/api/admin/it-dashboard")
        .then((data) => {
          if (!cancelled) setPayload(data);
        })
        .catch(console.error)
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useVisibilityRefetch(() =>
    apiRequest("/api/admin/it-dashboard")
      .then(setPayload)
      .catch(console.error)
  );

  const officer = payload?.officer;
  const stats = payload?.stats || {};
  const byRole = payload?.officersByRole || [];
  const recent = payload?.recentInvites || [];
  const smtp = payload?.smtp;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8">
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
                  {officer.badgeId} · {officer.role}
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-teal/[0.08] px-2.5 py-1.5 text-[11px] text-teal">
              <ShieldCheck className="h-3 w-3" />
              {officer.scopeLabel}
            </span>
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label={t("it.totalOfficers")} value={loading ? "—" : stats.totalOfficers ?? 0} tone="teal" />
        <StatCard icon={KeyRound} label={t("it.pendingResets")} value={loading ? "—" : stats.pendingPasswordResets ?? 0} tone="amber" />
        <StatCard icon={Clock} label={t("it.mustChange")} value={loading ? "—" : stats.mustChangePassword ?? 0} tone="default" />
        <StatCard icon={Activity} label={t("it.activeOfficers")} value={loading ? "—" : stats.activeOfficers ?? 0} tone="default" />
      </div>

      <Card className="p-6">
        <SectionLabel className="mb-3">{t("dash.quickActions")}</SectionLabel>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { to: "/invite", icon: UserPlus, label: t("nav.invite"), tone: "teal" as const },
            { to: "/password-resets", icon: KeyRound, label: t("nav.passwordResets"), tone: "amber" as const },
            { to: "/administration", icon: Users, label: t("nav.officers"), tone: "muted" as const },
          ].map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className="flex items-center gap-3 rounded-2xl border border-hairline px-3 py-2.5 transition-colors hover:bg-surface-2"
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
              <span className="flex-1 text-[13px] font-medium">{action.label}</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <SectionLabel className="mb-3">{t("it.byRank")}</SectionLabel>
          {loading ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : byRole.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("it.noOfficers")}</p>
          ) : (
            <ul className="space-y-1.5">
              {byRole.map((row: { role: string; n: number }) => (
                <li key={row.role} className="flex items-center justify-between rounded-xl border border-hairline px-3 py-2 text-sm">
                  <span className="font-medium">{row.role}</span>
                  <span className="tabular-nums text-muted-foreground">{row.n}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <SectionLabel>{t("it.recentInvites")}</SectionLabel>
            <Link to="/invite" className="text-[11px] font-medium text-teal hover:text-teal/80">
              {t("nav.invite")}
            </Link>
          </div>
          {loading ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("it.noInvites")}</p>
          ) : (
            <ul className="space-y-1.5">
              {recent.map((row: any) => (
                <li key={row.id} className="flex items-center justify-between gap-2 rounded-xl border border-hairline px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.name}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{row.badgeId} · {row.role}</p>
                  </div>
                  <Badge tone="muted">{row.status || "—"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {smtp && (
        <Card className="p-6">
          <SectionLabel className="mb-2">{t("admin.smtp")}</SectionLabel>
          <div className="flex items-start gap-3">
            <Mail className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div>
              <p className="text-sm">
                {smtp.configured ? t("admin.smtpConfigured") : t("admin.smtpMissing")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Host: {smtp.host || "—"} · From: {smtp.from || "—"}
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function Overview() {
  const { user } = useAuth();
  const { t } = useI18n();
  const isIt = Boolean(user?.capabilities?.isPoliceIt);

  const [officer, setOfficer] = useState<DashboardOfficer | null>(null);
  const [attention, setAttention] = useState<DashboardAttention | null>(null);
  const [stats, setStats] = useState({ totalCases: 0, clearanceRate: 0, highRiskAlerts: 0, openCases: 0 });
  const [recentCases, setRecentCases] = useState<RecentCase[]>([]);
  const [stationBreakdown, setStationBreakdown] = useState<
    { stationId: string; stationName: string; caseCount: number; openCount: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async (initial = false) => {
    if (isIt) return;
    if (initial) setLoading(true);
    try {
      const payload = await apiRequest("/api/dashboard");
      setOfficer(payload.officer ?? null);
      setAttention(payload.attention ?? null);
      if (payload.stats) setStats(payload.stats);
      setRecentCases(payload.recentCases || []);
      setStationBreakdown(payload.stationBreakdown || []);
      setLoadedOnce(true);
      setError("");
    } catch (loadError) {
      console.error(loadError);
      setError("Dashboard information could not be refreshed.");
    } finally {
      setLoading(false);
    }
  }, [isIt]);

  useEffect(() => {
    void loadDashboard(true);
  }, [loadDashboard]);

  useVisibilityRefetch(() => loadDashboard(false), !isIt);

  if (isIt) {
    return <PoliceItOverview />;
  }

  const attentionRows = attention
    ? [
        { key: "overdue", icon: ShieldAlert, label: t("dash.chargesheetLapsed"), value: attention.overdue, to: "/deadlines", tone: "danger" as const },
        { key: "urgent", icon: Clock, label: t("dash.dueWithin15"), value: attention.urgent, to: "/deadlines", tone: "amber" as const },
        { key: "matches", icon: GitMerge, label: t("dash.leadsAwaiting"), value: attention.pendingMatches, to: "/cases?hasPendingMatches=true", tone: "amber" as const },
        { key: "zones", icon: AlertTriangle, label: t("dash.highRiskZones"), value: attention.highRiskAlerts, to: "/hotspots", tone: "muted" as const },
      ].filter((r) => r.value > 0)
    : [];

  return (
    <div className="max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8">
      {error && (
        <div className="mb-6">
          <DataLoadError
            message={error}
            showingStaleData={loadedOnce}
            onRetry={() => void loadDashboard(!loadedOnce)}
          />
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Main Column */}
        <div className="lg:col-span-2 space-y-6">
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard icon={Briefcase} label={t("dash.openInvestigations")} value={loading ? "—" : stats.openCases} tone="teal" />
            <StatCard icon={TrendingUp} label={t("dash.clearanceRate")} value={loading ? "—" : `${stats.clearanceRate}%`} tone="default" />
            <StatCard icon={Activity} label={t("dash.totalCases")} value={loading ? "—" : stats.totalCases} tone="default" />
          </div>

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
        </div>

        {/* Right Sidebar Column */}
        <div className="space-y-6">
          {stationBreakdown.length > 0 && (
            <Card className="p-6">
              <SectionLabel className="mb-3">Stations in jurisdiction</SectionLabel>
              <div className="space-y-1.5">
                {stationBreakdown.map((row) => (
                  <div
                    key={row.stationId}
                    className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface px-3 py-2.5"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-foreground">{row.stationName}</p>
                      <p className="text-[11px] text-muted-foreground">{row.openCount} open</p>
                    </div>
                    <span className="text-lg font-bold tabular-nums text-foreground">{row.caseCount}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

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
          </Card>

          <Card className="p-6">
            <SectionLabel className="mb-3">System & Security</SectionLabel>
            <div className="space-y-4 mt-2">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal/10 text-teal">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-foreground">All systems operational</p>
                  <p className="text-[11px] text-muted-foreground">End-to-end encrypted session</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-foreground">Audit logging active</p>
                  <p className="text-[11px] text-muted-foreground">All queries are securely logged</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
