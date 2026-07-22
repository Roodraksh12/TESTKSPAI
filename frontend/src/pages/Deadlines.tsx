import { useEffect, useState } from "react";
import { apiRequest } from "@/api/client";
import { Card, SectionLabel, Skeleton } from "@/components/scrb/primitives";
import { ShieldAlert } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { DeadlineRiskList, DeadlineSummaryTiles, type DeadlineRow, type DeadlineSummary } from "@/components/scrb/deadline-board";
import { ChargesheetEditor } from "@/components/scrb/ChargesheetEditor";
import { useVisibilityRefetch } from "@/hooks/useVisibilityRefetch";

export default function Deadlines() {
  const { t } = useI18n();
  const [board, setBoard] = useState<DeadlineRow[]>([]);
  const [summary, setSummary] = useState<DeadlineSummary>({});
  const [loading, setLoading] = useState(true);
  const [editorCaseId, setEditorCaseId] = useState<string | null>(null);

  const load = () =>
    apiRequest("/api/deadlines")
      .then((payload) => {
        setBoard(payload.board || []);
        setSummary(payload.summary || {});
      })
      .catch(console.error)
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  useVisibilityRefetch(load);

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto p-4 sm:p-6 lg:p-8">
      <Card accent="danger" className="p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <SectionLabel className="mb-2">{t("deadlines.label")}</SectionLabel>
            <h1 className="text-display text-3xl">{t("deadlines.title")}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {t("deadlines.intro")}
            </p>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : (
        <DeadlineSummaryTiles summary={summary} />
      )}

      <div>
        <SectionLabel className="mb-3">{t("deadlines.riskList")}</SectionLabel>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
        ) : (
          <DeadlineRiskList board={board} onOpenEditor={setEditorCaseId} />
        )}
      </div>

      <Card className="p-5">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Clocks anchor to the FIR reported date because arrest/remand dates aren&apos;t tracked in the
          schema — the legally exact BNSS 187(3) clock runs from first remand. Victim progress updates are
          a separate statutory duty under BNSS 193(3)(ii). Urgent/Watch thresholds (15/30 days) are
          configurable operational policy, not law.
        </p>
      </Card>

      <ChargesheetEditor
        caseId={editorCaseId}
        isOpen={!!editorCaseId}
        onClose={() => setEditorCaseId(null)}
      />
    </div>
  );
}
