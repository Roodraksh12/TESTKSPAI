"use client";

import { useNavigate, useSearchParams } from "react-router-dom";
import { useCallback } from "react";
import { Filter, Calendar, MapPin, ShieldQuestion, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const CRIME_TYPES = [
  "All Crimes",
  "Theft",
  "Assault",
  "Fraud",
  "Cybercrime",
  "Narcotics",
  "Homicide",
];

const STATUSES = [
  { value: "All Statuses", label: "All Statuses" },
  { value: "OPEN", label: "Open" },
  { value: "UNDER_INVESTIGATION", label: "Under Investigation" },
  { value: "CHARGESHEETED", label: "Charge Sheeted" },
  { value: "CLOSED", label: "Closed" },
];

function FilterSelect({
  icon: Icon,
  value,
  onChange,
  children,
}: {
  icon: typeof Filter;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-surface px-3.5 py-2 text-sm hover:border-foreground/20 transition-colors">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-foreground outline-none cursor-pointer text-[13px] font-medium"
      >
        {children}
      </select>
    </div>
  );
}

export function CasesFilter({
  stations,
}: {
  stations: { id: string; name: string }[];
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isSp = user?.role === "SP";

  const currentCrimeType = searchParams.get("crimeType") || "All Crimes";
  const currentStatus = searchParams.get("status") || "All Statuses";
  const currentStation = searchParams.get("stationId") || "all";
  const currentDate = searchParams.get("date") || "all";
  const hasPendingMatches = searchParams.get("hasPendingMatches") === "true";

  const updateFilters = useCallback(
    (name: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "all" || value === "All Crimes" || value === "All Statuses" || value === null) {
        params.delete(name);
      } else {
        params.set(name, value);
      }
      navigate(`/cases?${params.toString()}`);
    },
    [navigate, searchParams]
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-hairline bg-surface p-3 shadow-sm">
        <FilterSelect icon={Filter} value={currentCrimeType} onChange={(v) => updateFilters("crimeType", v)}>
          {CRIME_TYPES.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </FilterSelect>

        <FilterSelect icon={ShieldQuestion} value={currentStatus} onChange={(v) => updateFilters("status", v)}>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </FilterSelect>

        {isSp && (
          <FilterSelect icon={MapPin} value={currentStation} onChange={(v) => updateFilters("stationId", v)}>
            <option value="all">All Locations</option>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>{station.name}</option>
            ))}
          </FilterSelect>
        )}

        <FilterSelect icon={Calendar} value={currentDate} onChange={(v) => updateFilters("date", v)}>
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
        </FilterSelect>
      </div>
      {hasPendingMatches && (
        <div className="flex items-center">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber/10 px-2.5 py-1 text-xs font-medium text-amber border border-amber/20">
            Pending Matches
            <button onClick={() => updateFilters("hasPendingMatches", null)} className="ml-1 hover:text-amber/70" title="Clear filter">
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
