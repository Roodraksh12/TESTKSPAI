import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "@/api/client";
import { Card, SectionLabel, Badge, StatCard } from "@/components/scrb/primitives";
import { TrendingUp, AlertTriangle, ShieldCheck, PieChart, Activity, ActivitySquare, ArrowRight } from "lucide-react";
import { CrimeTrendChart, PredictiveRadarChart, type TrendDatum, type TrendSeries, type ForecastAxis } from "@/components/scrb/trend-charts";
import { EarlyWarningsFeed, type EarlyWarning } from "@/components/scrb/early-warnings";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/lib/i18n";

type AnalyticsPayload = {
  metrics: {
    totalCases: number;
    clearanceRate: number;
    crimeTypeBreakdown: Record<string, number>;
    highRiskZones: number;
    topZone: { zoneLabel: string; riskScore: number } | null;
  };
  trend: { data: TrendDatum[]; series: TrendSeries[] };
  forecast: { axes: ForecastAxis[]; baseline: number };
  earlyWarnings: EarlyWarning[];
  dailyVolume: { date: string; count: number }[];
};

export default function Analytics() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [payload, setPayload] = useState<AnalyticsPayload | null>(null);

  useEffect(() => {
    apiRequest("/api/analytics").then(setPayload).catch(console.error);
  }, []);

  // Composition of the current caseload. This was already computed server-side
  // and thrown away; it answers "what am I actually dealing with?", which the
  // time-series trend chart beside it does not.
  const crimeMix = Object.entries(payload?.metrics.crimeTypeBreakdown ?? {})
    .sort((a, b) => b[1] - a[1]);
  const mixTotal = crimeMix.reduce((sum, [, n]) => sum + n, 0);

  const totalCases = payload?.metrics.totalCases ?? 0;
  const clearanceRate = payload?.metrics.clearanceRate ?? 0;
  const highRiskZones = payload?.metrics.highRiskZones ?? 0;
  const topZone = payload?.metrics.topZone ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <SectionLabel className="mb-2">{t("analytics.label")}</SectionLabel>
          <h1 className="text-display text-3xl">{t("analytics.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time analytics and predictive intelligence for {user?.role === "SP" ? "the entire district" : "your station"}.
          </p>
        </div>
        <Badge tone="teal" className="gap-2 px-3 py-1.5">
          <Activity className="h-4 w-4" /> {t("analytics.liveSync")}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card accent="teal" className="p-5">
          <StatCard icon={TrendingUp} label={t("analytics.totalActive")} value={totalCases} tone="teal" className="border-none shadow-none p-0" />
        </Card>

        <Card accent="amber" className="p-5">
          <div className="flex flex-col gap-2">
            <StatCard icon={ShieldCheck} label={t("analytics.clearanceYtd")} value={`${clearanceRate}%`} tone="default" className="border-none shadow-none p-0" />
            <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full bg-amber rounded-full transition-all" style={{ width: `${clearanceRate}%` }} />
            </div>
          </div>
        </Card>

        <Card accent="danger" className="p-5">
          <div className="flex flex-col gap-2">
            <StatCard icon={AlertTriangle} label={t("analytics.highRiskZones")} value={highRiskZones} tone="danger" className="border-none shadow-none p-0" />
            <p className="text-xs text-muted-foreground px-1">
              {topZone ? `${topZone.zoneLabel} at risk score ${topZone.riskScore}` : "No elevated zones in current window"}
            </p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card accent="danger" className="p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-danger/10 text-danger">
                <PieChart className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-semibold tracking-tight">{t("analytics.caseMix")}</h2>
            </div>
            {mixTotal > 0 && <Badge tone="muted">{mixTotal} cases</Badge>}
          </div>
          {crimeMix.length === 0 ? (
            <p className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
              {t("analytics.noCases")}
            </p>
          ) : (
            <div className="space-y-2.5">
              {crimeMix.slice(0, 6).map(([type, count]) => {
                const pct = mixTotal > 0 ? Math.round((count / mixTotal) * 100) : 0;
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="min-w-0 truncate font-medium text-foreground">{type}</span>
                      <span className="text-mono ml-2 shrink-0 text-[11px] text-muted-foreground">
                        {count} · {pct}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-danger/70 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {crimeMix.length > 6 && (
                <p className="pt-1 text-[10px] text-muted-foreground">
                  +{crimeMix.length - 6} more crime types
                </p>
              )}
            </div>
          )}
          <Link
            to="/cases"
            className="mt-auto pt-3 inline-flex items-center justify-center gap-1.5 rounded-xl border border-hairline bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            {t("analytics.browseCases")} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Card>

        <Card accent="teal" className="p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal/10 text-teal">
              <ActivitySquare className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-semibold tracking-tight">{t("analytics.crimeTrend")}</h2>
          </div>
          <CrimeTrendChart data={payload?.trend.data} series={payload?.trend.series} />
        </Card>

        <Card accent="amber" className="p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber/10 text-amber">
              <PieChart className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-semibold tracking-tight">{t("analytics.riskForecast")}</h2>
          </div>
          <PredictiveRadarChart axes={payload?.forecast.axes} baseline={payload?.forecast.baseline} />
        </Card>

        <Card accent="amber" className="p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber/10 text-amber">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-semibold tracking-tight">{t("analytics.earlyWarning")}</h2>
            </div>
            <span className="text-[10px] font-medium text-muted-foreground bg-surface-2 px-2 py-1 rounded-md">
              {t("analytics.dataDriven")}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto pr-2">
            <EarlyWarningsFeed warnings={payload?.earlyWarnings} />
          </div>
        </Card>
      </div>
    </div>
  );
}
