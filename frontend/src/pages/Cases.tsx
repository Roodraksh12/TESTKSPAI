import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiRequest } from "@/api/client";
import { CaseCard } from "@/components/scrb/case-ledger";
import { CasesFilter } from "@/components/scrb/cases-filter";

export default function Cases() {
  const [searchParams] = useSearchParams();
  const [cases, setCases] = useState<any[]>([]);
  const [stations, setStations] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const crimeType = searchParams.get("crimeType") || "";
  const stationId = searchParams.get("stationId") || "";
  const status = searchParams.get("status") || "";
  const date = searchParams.get("date") || "";
  const q = searchParams.get("q") || "";

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");

    const params = new URLSearchParams();
    if (crimeType) params.set("crimeType", crimeType);
    if (stationId) params.set("stationId", stationId);
    if (status) params.set("status", status);
    if (date) params.set("date", date);
    if (q) params.set("q", q);
    const query = params.toString();

    apiRequest(`/api/cases${query ? `?${query}` : ""}`, { signal: controller.signal })
      .then((payload) => {
        setCases(payload.cases || []);
        setStations(payload.stations || []);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(err.message || "Failed to load cases");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [crimeType, stationId, status, date, q]);

  return (
    <div className="flex h-full flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Cases Directory</h1>
        <p className="text-sm text-muted-foreground">Browse, filter, and manage all registered cases.</p>
      </div>

      <CasesFilter stations={stations} />

      {error ? (
        <div className="flex h-40 items-center justify-center text-sm text-destructive">{error}</div>
      ) : loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-hairline bg-surface-2"
            />
          ))}
        </div>
      ) : cases.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-hairline bg-surface-2 shadow-sm">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">No cases found matching your filters.</p>
            <p className="text-xs text-muted-foreground/60">Try adjusting your search or filter criteria.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {cases.map((c) => (
            <CaseCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}
