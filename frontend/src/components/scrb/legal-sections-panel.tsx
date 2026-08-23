import { useEffect, useState } from "react";
import { Scale, Info, ChevronDown } from "lucide-react";
import { Badge, Card, SectionLabel, Skeleton } from "@/components/scrb/primitives";
import { apiRequest } from "@/api/client";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { LegalSectionHover } from "./LegalSectionHover";

export type SectionPrediction = {
  id: string;
  bnsSection: string;
  title: string;
  punishment: string;
  cognizable: boolean;
  bailable: boolean;
  confidence: number;
  basis: "primary" | "conditional";
  matchedKeywords: string[];
  rationale: string;
};

export type LegalPrediction = {
  crimeType: string | null;
  predictions: SectionPrediction[];
  evidenceNeeded: string[];
  matched: boolean;
  note: string;
  disclaimer: string;
};

function confidenceTone(confidence: number): "danger" | "amber" | "muted" {
  if (confidence >= 80) return "danger";
  if (confidence >= 55) return "amber";
  return "muted";
}

function SectionRow({ prediction, caseId }: { prediction: SectionPrediction; caseId?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-hairline bg-surface overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <LegalSectionHover section={prediction.bnsSection} caseId={caseId}>
              <span className="text-mono text-[11px] font-semibold text-teal">{prediction.bnsSection}</span>
            </LegalSectionHover>
            {prediction.basis === "conditional" && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground uppercase tracking-wide">
                {t("legal.conditional")}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[12px] font-medium text-foreground">{prediction.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={confidenceTone(prediction.confidence)}>{prediction.confidence}%</Badge>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="border-t border-hairline bg-surface-2 px-3 py-2.5 space-y-2">
          <p className="text-[11px] leading-relaxed text-muted-foreground">{prediction.rationale}</p>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-md border border-hairline bg-surface px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {prediction.cognizable ? t("legal.cognizable") : t("legal.nonCognizable")}
            </span>
            <span className="rounded-md border border-hairline bg-surface px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {prediction.bailable ? t("legal.bailable") : t("legal.nonBailable")}
            </span>
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">{t("legal.punishment")}:</span> {prediction.punishment}
          </p>
        </div>
      )}
    </div>
  );
}

export function LegalSectionsPanel({
  caseId,
  crimeType,
  summary,
  className,
}: {
  /** When set, sections are predicted for a saved case (jurisdiction-scoped). */
  caseId?: string;
  /** Used instead of caseId for facts not yet saved, e.g. during FIR intake. */
  crimeType?: string;
  summary?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [data, setData] = useState<LegalPrediction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!caseId && !crimeType) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    const path = caseId
      ? `/api/legal/case/${caseId}`
      : `/api/legal/predict?crimeType=${encodeURIComponent(crimeType || "")}&summary=${encodeURIComponent(
          (summary || "").slice(0, 1200)
        )}`;

    apiRequest(path)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [caseId, crimeType, summary]);

  return (
    <Card accent="amber" className={cn("p-5", className)}>
      <div className="flex items-center gap-2 border-b border-hairline pb-2 mb-3">
        <Scale className="h-4 w-4 text-amber" />
        <SectionLabel>{t("legal.expectedSections")}</SectionLabel>
        {data?.predictions.length ? <Badge tone="muted">{data.predictions.length}</Badge> : null}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-2xl" />
          ))}
        </div>
      ) : !data ? (
        <p className="text-xs text-muted-foreground">Enter a crime type to see the sections it usually attracts.</p>
      ) : (
        <>
          {data.predictions.length === 0 ? (
            <p className="text-xs text-muted-foreground">{data.note || t("legal.noMatch")}</p>
          ) : (
            <div className="space-y-1.5">
              {data.predictions.map((prediction) => (
                <SectionRow key={prediction.id} prediction={prediction} caseId={caseId} />
              ))}
            </div>
          )}

          {data.evidenceNeeded.length > 0 && (
            <div className="mt-4">
              <SectionLabel className="mb-2">{t("legal.evidenceToSecure")}</SectionLabel>
              <ul className="space-y-1">
                {data.evidenceNeeded.map((item) => (
                  <li key={item} className="flex gap-2 text-[11px] leading-relaxed text-muted-foreground">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 flex gap-2 rounded-xl border border-hairline bg-surface-2 p-2.5">
            <Info className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
            <p className="text-[10px] leading-relaxed text-muted-foreground">{data.disclaimer}</p>
          </div>
        </>
      )}
    </Card>
  );
}
