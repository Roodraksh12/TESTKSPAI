import { useEffect, useState, useMemo } from "react";
import { apiRequest } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { Card, Badge, IconOrb, SectionLabel, Skeleton, Input } from "@/components/scrb/primitives";
import { 
  ClipboardList, 
  MessageSquare, 
  FileUp, 
  FilePlus2, 
  Check, 
  X, 
  FileDown, 
  User, 
  Shield, 
  Search
} from "lucide-react";

type AuditLog = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: string | null;
  createdAt: string;
  officerName: string;
  officerBadgeId: string;
  officerRole: string;
  stationName: string;
};

const ACTION_ICON: Record<string, typeof MessageSquare> = {
  CHAT_QUERY: MessageSquare,
  CREATE_CASE: FilePlus2,
  FIR_UPLOAD: FileUp,
  CASE_INTAKE: FilePlus2,
  DRAFT_CASE_SUMMARY: FilePlus2,
  CONFIRM_MATCH: Check,
  REJECT_MATCH: X,
  EXPORT_CHAT_PDF: FileDown,
  EXPORT_CASE_PDF: FileDown,
  EXPORT_NETWORK_PDF: FileDown,
};

const ACTION_TONE: Record<string, "teal" | "amber" | "danger" | "neutral"> = {
  CREATE_CASE: "teal",
  FIR_UPLOAD: "teal",
  CONFIRM_MATCH: "teal",
  REJECT_MATCH: "muted" as any,
  EXPORT_CHAT_PDF: "amber",
  EXPORT_CASE_PDF: "amber",
  EXPORT_NETWORK_PDF: "amber",
};

export default function Audit() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"my" | "jurisdiction">("my");
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const isSupervisorOrAdmin = !user?.capabilities?.isLeaf || user?.capabilities?.isPoliceIt || user?.role === "SP" || user?.role === "INSPECTOR" || user?.role === "DYSP";

  const jurisdictionLabel = useMemo(() => {
    if (user?.capabilities?.isPoliceIt || user?.role === "POLICE_IT") return "Statewide Audit Trail";
    const level = user?.capabilities?.scopeLevel;
    if (level === "DISTRICT" || user?.role === "SP") return "District Audit Trail";
    if (level === "SUBDIVISION" || user?.role === "DYSP") return "Subdivision Audit Trail";
    if (level === "COMMAND_RANGE") return "Range Audit Trail";
    return "Station Audit Trail";
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiRequest(`/api/audit?scope=${activeTab}`)
      .then((payload) => {
        if (!cancelled) setLogs(payload.auditLogs || []);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    const q = searchQuery.toLowerCase();
    return logs.filter((log) => {
      return (
        log.officerName?.toLowerCase().includes(q) ||
        log.officerBadgeId?.toLowerCase().includes(q) ||
        log.action?.toLowerCase().includes(q) ||
        log.details?.toLowerCase().includes(q) ||
        log.stationName?.toLowerCase().includes(q)
      );
    });
  }, [logs, searchQuery]);

  return (
    <div className="space-y-6 max-w-[1100px] mx-auto p-4 sm:p-6 lg:p-8">
      <Card accent="teal" className="p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-2">
          <ClipboardList className="h-4 w-4 text-teal" />
          <SectionLabel>Audit Trail</SectionLabel>
        </div>
        <h1 className="text-display text-3xl">Nothing is off the record</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every copilot query, FIR upload, match decision, and PDF export is logged here. Switch between your personal portal activity and your supervisory jurisdiction view below.
        </p>
      </Card>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Tab switcher */}
        <div className="flex items-center gap-2 bg-surface-2 p-1.5 rounded-2xl border border-hairline w-fit">
          <button
            type="button"
            onClick={() => {
              setActiveTab("my");
              setSearchQuery("");
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              activeTab === "my"
                ? "bg-surface text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <User className="h-4 w-4 text-teal" />
            <span>My Portal Activity</span>
            {activeTab === "my" && !loading && (
              <span className="ml-1 px-2 py-0.5 text-[11px] rounded-full bg-teal/10 text-teal font-mono">
                {logs.length}
              </span>
            )}
          </button>

          {isSupervisorOrAdmin && (
            <button
              type="button"
              onClick={() => {
                setActiveTab("jurisdiction");
                setSearchQuery("");
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === "jurisdiction"
                  ? "bg-surface text-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Shield className="h-4 w-4 text-amber" />
              <span>{jurisdictionLabel}</span>
              {activeTab === "jurisdiction" && !loading && (
                <span className="ml-1 px-2 py-0.5 text-[11px] rounded-full bg-amber/10 text-amber font-mono">
                  {logs.length}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Live Search Bar */}
        <div className="relative w-full sm:w-72">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${activeTab === "my" ? "your logs" : "officer, action, station"}...`}
            className="pl-9 pr-8 bg-surface border-hairline rounded-xl text-sm"
          />
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <Card className="p-4 sm:p-6">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-2xl" />
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            {searchQuery ? "No matching audit entries found for your search." : "No audit entries in this scope yet."}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredLogs.map((log) => {
              const Icon = ACTION_ICON[log.action] || ClipboardList;
              const tone = ACTION_TONE[log.action] || "neutral";
              const date = new Date(log.createdAt);
              return (
                <div key={log.id} className="glass flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 transition hover:bg-muted/50">
                  <IconOrb tone={tone === "danger" ? "amber" : (tone as any)} size="sm">
                    <Icon className="h-3.5 w-3.5" />
                  </IconOrb>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={tone === "neutral" ? "muted" : tone}>{log.action.replace(/_/g, " ")}</Badge>
                      <span className="text-sm font-medium text-foreground">{log.officerName}</span>
                      <span className="text-mono text-[11px] text-muted-foreground">{log.officerBadgeId}</span>
                      <span className="text-[11px] text-muted-foreground">· {log.stationName || "Headquarters"}</span>
                    </div>
                    {log.details && <p className="mt-0.5 text-xs text-muted-foreground truncate">{log.details}</p>}
                  </div>
                  <span className="text-mono shrink-0 text-[11px] text-muted-foreground whitespace-nowrap">
                    {date.toLocaleDateString()} · {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

