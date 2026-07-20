import { useEffect, useState } from "react";
import { apiRequest } from "@/api/client";
import { Card, Badge, IconOrb, SectionLabel, Skeleton } from "@/components/scrb/primitives";
import { ClipboardList, MessageSquare, FileUp, FilePlus2, Check, X, FileDown } from "lucide-react";

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
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiRequest("/api/audit")
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
  }, []);

  return (
    <div className="space-y-6 max-w-[1100px] mx-auto p-4 sm:p-6 lg:p-8">
      <Card accent="teal" className="p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-2">
          <ClipboardList className="h-4 w-4 text-teal" />
          <SectionLabel>Audit Trail</SectionLabel>
        </div>
        <h1 className="text-display text-3xl">Nothing is off the record</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every copilot query, FIR upload, match decision, and PDF export is logged here. Constables see
          their own actions, inspectors see their whole station, and SPs see everything district-wide.
        </p>
      </Card>

      <Card className="p-4 sm:p-6">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-2xl" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            No audit entries in scope yet.
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const Icon = ACTION_ICON[log.action] || ClipboardList;
              const tone = ACTION_TONE[log.action] || "neutral";
              const date = new Date(log.createdAt);
              return (
                <div key={log.id} className="glass flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
                  <IconOrb tone={tone === "danger" ? "amber" : (tone as any)} size="sm">
                    <Icon className="h-3.5 w-3.5" />
                  </IconOrb>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={tone === "neutral" ? "muted" : tone}>{log.action.replace(/_/g, " ")}</Badge>
                      <span className="text-sm font-medium text-foreground">{log.officerName}</span>
                      <span className="text-mono text-[11px] text-muted-foreground">{log.officerBadgeId}</span>
                      <span className="text-[11px] text-muted-foreground">· {log.stationName}</span>
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
