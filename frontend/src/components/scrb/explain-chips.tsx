import { ShieldCheck, Wrench, FileText, Cloud, LockKeyhole } from "lucide-react";
import { Link } from "react-router-dom";
import type { AiPrivacyMetadata } from "@/lib/store";

type CaseSource = { id: string; firNumber: string };

export function ExplainChips({
  toolsUsed,
  sources,
  sourceCases,
  privacy,
}: {
  toolsUsed?: string[];
  sources?: string[];
  sourceCases?: CaseSource[];
  privacy?: AiPrivacyMetadata | null;
}) {
  if ((!toolsUsed || toolsUsed.length === 0) && (!sources || sources.length === 0) && !privacy) return null;

  const sourceByFir = new Map((sourceCases || []).map((source) => [source.firNumber, source]));
  const hasGrounding = Boolean(toolsUsed?.length || sources?.length);

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1">
      {hasGrounding && (
        <span className="inline-flex items-center gap-1 rounded-md bg-teal/10 px-2 py-0.5 text-[10px] font-medium text-teal">
          <ShieldCheck className="h-2.5 w-2.5" />
          Grounded in records
        </span>
      )}
      {privacy && (
        <details className="group relative">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md bg-teal/10 px-2 py-0.5 text-[10px] font-medium text-teal [&::-webkit-details-marker]:hidden">
            {privacy.external ? <Cloud className="h-2.5 w-2.5" /> : <LockKeyhole className="h-2.5 w-2.5" />}
            {privacy.external ? "Sanitised external AI" : "Private model"}
          </summary>
          <div className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-xl border border-hairline bg-surface p-3 text-[10px] font-normal leading-relaxed text-muted-foreground shadow-xl">
            <p className="font-semibold text-foreground">AI data handling</p>
            <p className="mt-1">{privacy.provider} · {privacy.model}</p>
            <p className="mt-1">
              {privacy.external
                ? `${privacy.redaction.total} sensitive value${privacy.redaction.total === 1 ? "" : "s"} tokenised before transmission. ${privacy.retentionPolicy === "ZDR_REQUIRED" ? "Zero-data-retention routing was required." : "Zero-data-retention routing is paused; use synthetic demo data only."}`
                : "Processed through the administrator-approved private endpoint."}
            </p>
            {privacy.redaction.categories.length > 0 && (
              <p className="mt-1">
                Categories: {privacy.redaction.categories.map((item) => `${item.category.replace(/_/g, " ")} (${item.count})`).join(", ")}.
              </p>
            )}
            <p className="mt-1">Privacy processing: {privacy.privacyProcessingMs} ms · model request: {privacy.durationMs} ms.</p>
          </div>
        </details>
      )}
      {toolsUsed?.map((tool) => (
        <span key={tool} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
          <Wrench className="h-2.5 w-2.5" />
          {tool}
        </span>
      ))}
      {sources?.map((fir) => {
        const source = sourceByFir.get(fir);
        const target = source ? `/cases/${source.id}` : `/cases?q=${encodeURIComponent(fir)}`;
        return (
        <Link
          key={fir}
          to={target}
          title={`Open ${fir}`}
          className="inline-flex items-center gap-1 rounded-md bg-amber/10 px-2 py-0.5 text-[10px] font-mono text-amber transition-colors hover:bg-amber/20 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/40"
        >
          <FileText className="h-2.5 w-2.5" />
          {fir}
        </Link>
        );
      })}
    </div>
  );
}
