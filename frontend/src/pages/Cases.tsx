import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiRequest } from "@/api/client";
import { CaseCard } from "@/components/scrb/case-ledger";
import { CasesFilter } from "@/components/scrb/cases-filter";
import { useAuth } from "@/context/AuthContext";
import { DataLoadError } from "@/components/scrb/data-load-state";
import { Button } from "@/components/scrb/primitives";

export default function Cases() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [cases, setCases] = useState<any[]>([]);
  const [stations, setStations] = useState<{ id: string; name: string; districtName?: string | null }[]>([]);
  const [crimeTypes, setCrimeTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const crimeType = searchParams.get("crimeType") || "";
  const stationId = searchParams.get("stationId") || "";
  const status = searchParams.get("status") || "";
  const date = searchParams.get("date") || "";
  const q = searchParams.get("q") || "";
  const hasPendingMatches = searchParams.get("hasPendingMatches") || "";

  const buildCasesUrl = (cursor?: string | null) => {
    const params = new URLSearchParams();
    if (crimeType) params.set("crimeType", crimeType);
    if (stationId) params.set("stationId", stationId);
    if (status) params.set("status", status);
    if (date) params.set("date", date);
    if (q) params.set("q", q);
    if (hasPendingMatches === "true") params.set("hasPendingMatches", "true");
    if (cursor) params.set("cursor", cursor);
    params.set("limit", "50");
    return `/api/cases?${params.toString()}`;
  };

  useEffect(() => {
    // ProtectedRoute normally guarantees this, but the guard also prevents a
    // request from being made while a restored session is still being checked.
    if (!user?.id) return;

    const controller = new AbortController();
    setLoading(true);
    setError("");
    setCases([]);
    setNextCursor(null);

    apiRequest(buildCasesUrl(), {
      signal: controller.signal,
      fresh: true,
    })
      .then((payload) => {
        setCases(payload.cases || []);
        setStations(payload.stations || []);
        setCrimeTypes(payload.crimeTypes || []);
        setNextCursor(payload.nextCursor || null);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(err.message || "Failed to load cases");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [crimeType, stationId, status, date, q, hasPendingMatches, user?.id, reloadKey]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const payload = await apiRequest(buildCasesUrl(nextCursor), { fresh: true });
      setCases((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...(payload.cases || []).filter((item: any) => !seen.has(item.id))];
      });
      setNextCursor(payload.nextCursor || null);
    } catch (loadError: any) {
      setError(loadError?.message || "Failed to load more cases");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Cases Directory</h1>
        <p className="text-sm text-muted-foreground">Browse, filter, and manage all registered cases.</p>
      </div>

      <CasesFilter stations={stations} crimeTypes={crimeTypes} />

      {error && (
        <DataLoadError
          message={error}
          showingStaleData={cases.length > 0}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      )}

      {!error && loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-hairline bg-surface-2"
            />
          ))}
        </div>
      ) : !error && cases.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-hairline bg-surface-2 shadow-sm">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">No cases found matching your filters.</p>
            <p className="text-xs text-muted-foreground/60">Try adjusting your search or filter criteria.</p>
          </div>
        </div>
      ) : !error || cases.length > 0 ? (
        <div className="space-y-5">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {cases.map((c) => (
              <CaseCard key={c.id} c={c} />
            ))}
          </div>
          {nextCursor && (
            <div className="flex justify-center">
              <Button type="button" variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? "Loading more…" : "Load more cases"}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
