import { Loader2, CheckCircle2, AlertCircle, X, FileText } from "lucide-react";
import { Badge, Card, SectionLabel } from "@/components/scrb/primitives";
import { useFirQueue, type FirJob } from "@/lib/fir-queue";
import { cn } from "@/lib/utils";

function StatusIcon({ status }: { status: FirJob["status"] }) {
  if (status === "done") return <CheckCircle2 className="h-4 w-4 text-teal" />;
  if (status === "error") return <AlertCircle className="h-4 w-4 text-danger" />;
  return <Loader2 className="h-4 w-4 animate-spin text-amber" />;
}

export function FirQueuePanel({ onReview }: { onReview?: (jobId: string) => void }) {
  const jobs = useFirQueue((s) => s.jobs);
  const activeJobId = useFirQueue((s) => s.activeJobId);
  const setActiveJob = useFirQueue((s) => s.setActiveJob);
  const discard = useFirQueue((s) => s.discard);
  const clearFinished = useFirQueue((s) => s.clearFinished);

  if (jobs.length === 0) return null;

  const running = jobs.filter((j) => j.status === "queued" || j.status === "processing").length;

  return (
    <Card accent="teal" className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <SectionLabel>Processing queue</SectionLabel>
        <div className="flex items-center gap-2">
          {running > 0 && <Badge tone="amber">{running} running</Badge>}
          {jobs.some((j) => j.status === "done" || j.status === "error") && (
            <button
              onClick={() => void clearFinished()}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear finished
            </button>
          )}
        </div>
      </div>

      <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
        Scans are processed on the server. The queue and completed results remain visible after a
        page reload; an interrupted server task is shown as needing a retry.
      </p>

      <div className="space-y-1.5">
        {jobs.map((job) => {
          const isActive = job.jobId === activeJobId;
          const isDone = job.status === "done";
          return (
            <div
              key={job.jobId}
              className={cn(
                "flex items-center gap-2.5 rounded-2xl border px-3 py-2 transition-colors",
                isActive ? "border-teal/30 bg-teal/[0.06]" : "border-hairline bg-surface"
              )}
            >
              <StatusIcon status={job.status} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-foreground">{job.filename}</p>
                <p
                  className={cn(
                    "truncate text-[10px]",
                    job.status === "error" ? "text-danger" : "text-muted-foreground"
                  )}
                >
                  {job.status === "error" ? job.error || "Failed" : job.stage}
                </p>
              </div>

              {isDone && (
                <button
                  onClick={() => {
                    setActiveJob(job.jobId);
                    onReview?.(job.jobId);
                  }}
                  className="shrink-0 rounded-lg border border-hairline bg-surface px-2.5 py-1 text-[10px] font-medium text-foreground hover:bg-muted transition-colors"
                >
                  {isActive ? "Reviewing" : "Review"}
                </button>
              )}

              <button
                onClick={() => discard(job.jobId)}
                aria-label={`Remove ${job.filename} from queue`}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {jobs.length > 1 && (
        <p className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <FileText className="h-3 w-3" />
          Review and save one at a time — each becomes its own FIR record.
        </p>
      )}
    </Card>
  );
}
