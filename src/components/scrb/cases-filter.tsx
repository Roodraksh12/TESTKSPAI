"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useEffect } from "react";
import { Search, Filter, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

const CRIME_TYPES = [
  "All Crimes",
  "Theft",
  "Assault",
  "Fraud",
  "Cybercrime",
  "Narcotics",
  "Homicide",
];

export function CasesFilter({
  stations,
}: {
  stations: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentCrimeType = searchParams.get("crimeType") || "All Crimes";
  const currentStation = searchParams.get("stationId") || "all";
  const currentDate = searchParams.get("date") || "all";

  const updateFilters = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "all" || value === "All Crimes") {
        params.delete(name);
      } else {
        params.set(name, value);
      }
      router.push(`/cases?${params.toString()}`);
    },
    [router, searchParams]
  );

  const [query, setQuery] = useState(searchParams.get("q") || "");

  useEffect(() => {
    const handler = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (query.trim()) {
        params.set("q", query);
      } else {
        params.delete("q");
      }
      if (searchParams.get("q") !== (query.trim() || null)) {
        router.push(`/cases?${params.toString()}`);
      }
    }, 400);
    return () => clearTimeout(handler);
  }, [query, searchParams, router]);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-hairline bg-surface p-4 shadow-sm md:flex-row md:items-center">
      <div className="flex flex-1 items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          placeholder="Search FIR, suspect, or keyword..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Crime Type Filter */}
        <div className="relative flex items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            className="bg-transparent font-medium text-foreground outline-none cursor-pointer"
            value={currentCrimeType}
            onChange={(e) => updateFilters("crimeType", e.target.value)}
          >
            {CRIME_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {/* Location / Station Filter */}
        <div className="relative flex items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm">
          <select
            className="bg-transparent font-medium text-foreground outline-none cursor-pointer"
            value={currentStation}
            onChange={(e) => updateFilters("stationId", e.target.value)}
          >
            <option value="all">All Locations</option>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date Filter */}
        <div className="relative flex items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <select
            className="bg-transparent font-medium text-foreground outline-none cursor-pointer"
            value={currentDate}
            onChange={(e) => updateFilters("date", e.target.value)}
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        </div>
      </div>
    </div>
  );
}
