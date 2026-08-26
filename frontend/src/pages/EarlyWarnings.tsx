import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BellRing,
  Check,
  Clock3,
  MapPin,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useEarlyWarnings } from "@/context/EarlyWarningsContext";
import { Badge, Button, Card, SectionLabel, StatCard } from "@/components/scrb/primitives";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Filter = "ALL" | "UNREAD" | "HIGH" | "CRITICAL";

function ageLabel(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function metricLabel(value: number | undefined) {
  if (typeof value !== "number") return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

export default function EarlyWarnings() {
  const { t } = useI18n();
  const {
    warnings,
    unreadCount,
    summary,
    loading,
    error,
    lastUpdated,
    refresh,
    markRead,
    markAllRead,
  } = useEarlyWarnings();
  const [filter, setFilter] = useState<Filter>("ALL");

  const filtered = useMemo(
    () =>
      warnings.filter((warning) => {
        if (filter === "UNREAD") return !warning.isRead;
        if (filter === "HIGH") return warning.severity === "HIGH";
        if (filter === "CRITICAL") return warning.severity === "CRITICAL";
        return true;
      }),
    [warnings, filter]
  );
  const highCount = warnings.filter(
    (warning) => warning.severity === "HIGH" || warning.severity === "CRITICAL"
  ).length;
  const activeCount = summary.activeCount || warnings.length;
  const highCriticalCount = summary.highCriticalCount || highCount;
  const noActiveWarnings = !loading && activeCount === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <SectionLabel className="mb-2">{t("warnings.label")}</SectionLabel>
          <h1 className="text-display text-3xl">{t("warnings.title")}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {t("warnings.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={error ? "danger" : "teal"} className="gap-2 px-3 py-1.5">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                error ? "bg-danger" : "bg-teal animate-pulse"
              )}
            />
            {error
              ? t("warnings.offline")
              : lastUpdated
                ? `${t("warnings.live")} · ${ageLabel(lastUpdated.toISOString())}`
                : t("warnings.connecting")}
          </Badge>
          <Button
            size="sm"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label={t("warnings.refresh")}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            {t("warnings.refresh")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={BellRing} label={t("warnings.active")} value={activeCount} tone="amber" />
        <StatCard icon={Clock3} label={t("warnings.awaitingAck")} value={unreadCount} tone="amber" />
        <StatCard icon={ShieldAlert} label={t("warnings.highCritical")} value={highCriticalCount} tone="danger" />
        <StatCard icon={MapPin} label={t("warnings.affectedStations")} value={summary.affectedStations} tone="teal" />
      </div>

      {error && (
        <Card accent="danger" className="p-4 text-sm text-danger">
          {error}
        </Card>
      )}

      <Card accent={unreadCount > 0 ? "amber" : "teal"} className="p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_repeat(3,minmax(130px,0.5fr))] lg:items-center">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                unreadCount > 0 ? "bg-amber/10 text-amber" : "bg-teal/10 text-teal"
              )}
            >
              {unreadCount > 0 ? <AlertTriangle className="h-5 w-5" /> : <Check className="h-5 w-5" />}
            </div>
            <div>
              <SectionLabel>{t("warnings.readiness")}</SectionLabel>
              <h2 className="mt-1 text-sm font-semibold">
                {noActiveWarnings
                  ? t("warnings.noThreshold")
                  : unreadCount > 0
                    ? `${unreadCount} ${t("warnings.pendingReviewCount")}`
                    : t("warnings.allAcknowledged")}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {noActiveWarnings
                  ? t("warnings.noThresholdHint")
                  : unreadCount > 0
                    ? t("warnings.reviewPending")
                    : t("warnings.monitoringContinues")}
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-surface-2 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("warnings.latestSignal")}
            </p>
            <p className="mt-1 text-sm font-semibold">
              {summary.latestDetectedAt ? ageLabel(summary.latestDetectedAt) : "—"}
            </p>
          </div>
          <div className="rounded-xl bg-surface-2 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("warnings.expiringSoon")}
            </p>
            <p className="mt-1 text-sm font-semibold">{summary.expiringSoonCount}</p>
          </div>
          <div className="rounded-xl bg-surface-2 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("warnings.detectionRule")}
            </p>
            <p className="mt-1 text-sm font-semibold">
              {summary.minimumCases}+ · {summary.currentWindowDays}d / {summary.baselineWindowDays}d
            </p>
          </div>
        </div>
      </Card>

      <Card accent="danger" className="p-5">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t("warnings.activeFeed")}</h2>
              <p className="text-xs text-muted-foreground">{t("warnings.explainable")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(["ALL", "UNREAD", "HIGH", "CRITICAL"] as Filter[]).map((option) => (
                <button
                  key={option}
                  onClick={() => setFilter(option)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                    filter === option
                      ? "border-ink bg-ink text-white"
                      : "border-hairline bg-surface text-muted-foreground hover:text-foreground"
                  )}
                >
                  {option === "UNREAD" ? `${t("warnings.unread")} (${unreadCount})` : option}
                </button>
              ))}
              {unreadCount > 0 && (
                <Button size="sm" variant="ghost" onClick={() => void markAllRead()}>
                  <Check className="h-3.5 w-3.5" /> {t("warnings.markAll")}
                </Button>
              )}
            </div>
          </div>

          {loading && warnings.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
              {t("warnings.loading")}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-hairline bg-surface-2 px-5 py-8 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-teal/10 text-teal">
                <Check className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">
                {warnings.length === 0 ? t("warnings.noThreshold") : t("warnings.none")}
              </p>
              <p className="mt-1 max-w-lg text-xs leading-relaxed text-muted-foreground">
                {warnings.length === 0 ? t("warnings.noThresholdHint") : t("warnings.filterHint")}
              </p>
              {warnings.length > 0 && filter !== "ALL" ? (
                <Button size="sm" className="mt-4" onClick={() => setFilter("ALL")}>
                  {t("warnings.clearFilter")}
                </Button>
              ) : (
                <Link
                  to="/hotspots"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  <MapPin className="h-3.5 w-3.5" /> {t("warnings.openHotspots")}
                </Link>
              )}
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {filtered.map((warning) => {
                const query = new URLSearchParams({
                  warning: warning.id,
                  lat: String(warning.latitude),
                  lng: String(warning.longitude),
                });
                return (
                  <article
                    key={warning.id}
                    className={cn(
                      "rounded-2xl border p-4 transition-colors",
                      warning.isRead
                        ? "border-hairline bg-surface"
                        : "border-amber/40 bg-amber/5"
                    )}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                          warning.severity === "CRITICAL"
                            ? "bg-danger/15 text-danger"
                            : warning.severity === "HIGH"
                              ? "bg-amber/15 text-amber"
                              : "bg-teal/15 text-teal"
                        )}
                      >
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{warning.zoneLabel}</h3>
                          <Badge
                            tone={
                              warning.severity === "CRITICAL"
                                ? "danger"
                                : warning.severity === "HIGH"
                                  ? "amber"
                                  : "teal"
                            }
                          >
                            {warning.severity}
                          </Badge>
                          {!warning.isRead && <span className="h-2 w-2 rounded-full bg-amber" />}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {warning.stationName}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3 w-3" /> {ageLabel(warning.lastDetectedAt)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Activity className="h-3 w-3" /> {warning.crimeType}
                          </span>
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                          <strong className="text-foreground">{t("warnings.evidence")}:</strong>{" "}
                          {warning.reason}
                        </p>
                        {typeof warning.evidence.currentCount === "number" && (
                          <div className="mt-3 grid grid-cols-3 gap-2">
                            <div className="rounded-lg bg-surface-2 px-2.5 py-2">
                              <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                                {warning.evidence.currentWindowDays || summary.currentWindowDays}d {t("warnings.caseCount")}
                              </p>
                              <p className="mt-0.5 text-sm font-semibold">
                                {metricLabel(warning.evidence.currentCount)}
                              </p>
                            </div>
                            <div className="rounded-lg bg-surface-2 px-2.5 py-2">
                              <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                                {t("warnings.weeklyBaseline")}
                              </p>
                              <p className="mt-0.5 text-sm font-semibold">
                                {metricLabel(warning.evidence.baselineWeekly)}
                              </p>
                            </div>
                            <div className="rounded-lg bg-surface-2 px-2.5 py-2">
                              <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                                {t("warnings.change")}
                              </p>
                              <p className="mt-0.5 text-sm font-semibold">
                                {typeof warning.evidence.growthRatio === "number"
                                  ? `+${Math.round(warning.evidence.growthRatio * 100)}%`
                                  : t("warnings.newPattern")}
                              </p>
                            </div>
                          </div>
                        )}
                        <p className="mt-2 rounded-xl bg-surface-2 p-3 text-xs text-foreground">
                          <span className="mr-1 text-muted-foreground">{t("warnings.recommended")}:</span>
                          {warning.action}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Link
                            to={`/hotspots?${query.toString()}`}
                            onClick={() => void markRead(warning.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink-2"
                          >
                            <MapPin className="h-3.5 w-3.5" /> {t("warnings.viewMap")}
                          </Link>
                          {!warning.isRead && (
                            <Button size="sm" variant="ghost" onClick={() => void markRead(warning.id)}>
                              <Check className="h-3.5 w-3.5" /> {t("warnings.markRead")}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
      </Card>
    </div>
  );
}
