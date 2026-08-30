"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { IconOrb } from "./primitives";
import { motion, AnimatePresence } from "framer-motion";

import { apiRequest } from "@/api/client";

type SuggestedStep = { id: string; text: string; rationale: string };
type SuggestionError = { kind: "disabled" | "unavailable"; message: string };

export function classifySuggestionError(error: unknown): SuggestionError {
  const message = error instanceof Error ? error.message : "The AI service could not be reached.";
  if (/external ai is disabled|ai.*disabled.*privacy policy/i.test(message)) {
    return {
      kind: "disabled",
      message: "AI suggestions are intentionally disabled by the demo privacy policy.",
    };
  }
  return {
    kind: "unavailable",
    message: message || "The AI service could not be reached.",
  };
}

export function PredictiveNextSteps({ caseId }: { caseId: string }) {
  const [steps, setSteps] = useState<SuggestedStep[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SuggestionError | null>(null);
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function fetchSteps() {
      setLoading(true);
      setError(null);
      setSteps(null);
      try {
        const data = await apiRequest("/api/ai/predict-steps", {
          method: "POST",
          body: JSON.stringify({ caseId }),
          signal: controller.signal,
        });
        if (active) setSteps(Array.isArray(data.steps) ? data.steps : []);
      } catch (requestError) {
        if (active && !controller.signal.aborted) {
          console.error(requestError);
          setError(classifySuggestionError(requestError));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void fetchSteps();
    return () => {
      active = false;
      controller.abort();
    };
  }, [caseId, requestKey]);

  return (
    <div className="glass rounded-3xl p-5 border border-hairline relative overflow-hidden">
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-teal-500/10 blur-3xl rounded-full pointer-events-none" />

      <div className="flex items-center gap-3 mb-4">
        <IconOrb tone="teal" size="sm">
          <Sparkles className="h-4 w-4" />
        </IconOrb>
        <div>
          <h3 className="font-semibold text-foreground leading-none">AI-assisted Investigation Suggestions</h3>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Review before acting</p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-6 text-muted-foreground"
          >
            <Loader2 className="h-5 w-5 animate-spin mb-2" />
            <span className="text-xs">Reviewing the available case record...</span>
          </motion.div>
        ) : error ? (
          <motion.div key={error.kind} className="rounded-2xl border border-amber/20 bg-amber/5 p-4">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {error.kind === "disabled" ? "AI suggestions are disabled" : "AI suggestions are temporarily unavailable"}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{error.message}</p>
                {error.kind === "unavailable" && (
                  <button
                    type="button"
                    onClick={() => setRequestKey((value) => value + 1)}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-teal hover:underline"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Retry
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        ) : steps && steps.length > 0 ? (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3 relative z-10"
          >
            {steps.map((step, idx) => (
              <div key={step.id || idx} className="group relative flex items-start gap-3 rounded-2xl bg-surface-2/50 p-3 hover:bg-surface-2 transition-colors border border-transparent hover:border-hairline">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface shadow-sm text-xs font-semibold text-foreground">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{step.text}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1 group-hover:line-clamp-none transition-all">{step.rationale}</p>
                </div>
              </div>
            ))}
          </motion.div>
        ) : (
          <motion.div key="empty" className="text-sm text-muted-foreground py-4">
            No suggestions were generated from the available case record.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
