import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/api/client";
import HotspotMap, { type HotspotCluster } from "@/components/scrb/hotspot-map.leaflet";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Card, Badge, IconOrb, SectionLabel, Skeleton } from "@/components/scrb/primitives";
import { useVisibilityRefetch } from "@/hooks/useVisibilityRefetch";
import { useSearchParams } from "react-router-dom";
import { DataLoadError } from "@/components/scrb/data-load-state";

type DailyVolume = { date: string; count: number };
type SparklinePath = { line: string; area: string } | null;

export default function Hotspots() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [clusters, setClusters] = useState<HotspotCluster[]>([]);
  const [dailyVolume, setDailyVolume] = useState<DailyVolume[]>([]);
  const [sparklinePath, setSparklinePath] = useState<SparklinePath>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    try {
      const payload = await apiRequest("/api/hotspots");
        setAlerts(payload.alerts || []);
        setClusters(payload.clusters || []);
        setDailyVolume(payload.dailyVolume || []);
        setSparklinePath(payload.sparklinePath || null);
        setLoadedOnce(true);
        setError("");
    } catch (loadError) {
      console.error(loadError);
      setError("Hotspot information could not be refreshed.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  useVisibilityRefetch(() => load(false));
  const focusLatParam = searchParams.get("lat");
  const focusLngParam = searchParams.get("lng");
  const focusLat = Number(focusLatParam);
  const focusLng = Number(focusLngParam);
  const focus: [number, number] | null =
    focusLatParam !== null &&
    focusLngParam !== null &&
    Number.isFinite(focusLat) &&
    Number.isFinite(focusLng)
      ? [focusLat, focusLng]
      : null;

  return (
    <div className="space-y-4">
      {error && (
        <DataLoadError
          message={error}
          showingStaleData={loadedOnce}
          onRetry={() => void load(!loadedOnce)}
        />
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
      <Card accent="danger" className="relative overflow-hidden p-6 flex flex-col h-[calc(100vh-10rem)]">
        <SectionLabel className="mb-2">{t("hotspots.label")}</SectionLabel>
        <h1 className="text-display text-2xl">{t("hotspots.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("hotspots.subtitle")}</p>

        <div className="relative mt-5 flex-1 w-full overflow-hidden rounded-3xl border border-hairline bg-surface/50 flex flex-col">
          {loading && !loadedOnce ? (
            <Skeleton className="h-full w-full rounded-3xl" />
          ) : (
            <HotspotMap clusters={clusters} focus={focus} />
          )}
        </div>
      </Card>

      <div className="space-y-6">
        <Card accent="amber" className="p-6">
          <SectionLabel className="mb-3">{t("hotspots.riskRanking")}</SectionLabel>
          <div className="space-y-3">
            {loading && !loadedOnce ? (
              Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-16 rounded-2xl" />
              ))
            ) : alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("hotspots.noAlerts")}</p>
            ) : (
              alerts.map((h) => {
                const isHighRisk = h.riskScore >= 80;
                return (
                  <div key={h.id} className="glass flex items-center gap-3 rounded-2xl p-3">
                    <IconOrb tone={isHighRisk ? "amber" : "teal"} size="sm">
                      <AlertTriangle className="h-3.5 w-3.5" />
                    </IconOrb>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{h.zoneLabel}</p>
                      <p className="text-mono text-[10px] text-muted-foreground truncate">{h.reason}</p>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <Badge tone={isHighRisk ? "amber" : "teal"}>{isHighRisk ? "High" : "Elevated"}</Badge>
                      <p className={"mt-1 inline-flex items-center gap-1 text-[11px] " + (isHighRisk ? "text-amber-soft" : "text-teal-soft")}>
                        <TrendingUp className="h-3 w-3" />
                        {h.riskScore}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card className="p-6">
          <SectionLabel className="mb-3">{t("hotspots.sevenDayTrend")}</SectionLabel>
          {loading && !loadedOnce ? (
            <Skeleton className="h-24 w-full rounded-xl" />
          ) : sparklinePath ? (
            <svg viewBox="0 0 200 60" className="h-24 w-full">
              <defs>
                <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(46,143,143,0.55)" />
                  <stop offset="100%" stopColor="rgba(46,143,143,0)" />
                </linearGradient>
              </defs>
              <path d={sparklinePath.area} fill="url(#g)" />
              <path d={sparklinePath.line} stroke="rgba(117,205,205,0.9)" strokeWidth="1.2" fill="none" />
            </svg>
          ) : (
            <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">No case volume yet.</div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Daily case volume across your jurisdiction, last 7 days.</p>
        </Card>
      </div>
      </div>
      {refreshing && loadedOnce && (
        <p className="text-right text-xs text-muted-foreground">Refreshing hotspot data…</p>
      )}
    </div>
  );
}
