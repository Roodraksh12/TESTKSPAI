import { useLocation, useParams } from "react-router-dom";

/**
 * Describes what the officer is currently looking at, so the quick-ask pill can
 * answer "this case" / "these deadlines" without them having to restate it.
 *
 * Only route-level facts go in here — the path, and any record id in it. The
 * page's actual data is not scraped or sent; the assistant re-reads records
 * through its own jurisdiction-scoped tools, which keeps RBAC intact and stops
 * the client from becoming a way to smuggle data into a prompt.
 */

export type PageContext = {
  /** Sentence handed to the model as situational context. */
  description: string;
  /** Case id when the officer is on a case-scoped route. */
  activeCaseId: string | null;
  /** Placeholder tailored to the page. */
  placeholder: string;
  /** Suggested questions that make sense here. */
  prompts: string[];
};

const DEFAULT_PROMPTS = [
  "Which cases risk default bail this month?",
  "Brief me on open cases at my station",
  "What are the current hotspot alerts?",
];

export function usePageContext(): PageContext {
  const { pathname } = useLocation();
  const params = useParams();
  const caseId = params.id ?? null;

  if (pathname.startsWith("/cases/") && caseId) {
    const leaf = pathname.endsWith("/chargesheet")
      ? "the charge sheet draft"
      : "the case dossier";
    return {
      description: `The officer is viewing ${leaf} for case ${caseId}. Questions about "this case" or "this FIR" refer to it.`,
      activeCaseId: caseId,
      placeholder: "Ask about this case…",
      prompts: [
        "Summarise this case",
        "Which sections fit these facts?",
        "Show MO-similar cases",
        "What are the next investigation steps?",
      ],
    };
  }

  const byPath: Record<string, Omit<PageContext, "activeCaseId">> = {
    "/overview": {
      description: "The officer is on the dashboard, showing their workload, statutory clock exposure and pending lead confirmations.",
      placeholder: "Ask about your workload…",
      prompts: ["What needs my attention today?", "Which cases are overdue?", "Summarise my station's caseload"],
    },
    "/cases": {
      description: "The officer is browsing the case list for their jurisdiction.",
      placeholder: "Ask about these cases…",
      prompts: ["How many cases are open?", "Which cases share a modus operandi?", "Show recent vehicle thefts"],
    },
    "/deadlines": {
      description: "The officer is on the statutory deadline board, tracking BNSS 187(3) charge-sheet clocks and default-bail exposure.",
      placeholder: "Ask about deadlines…",
      prompts: ["Which cases risk default bail?", "What lapses in the next 15 days?", "Explain BNSS 187(3)"],
    },
    "/analytics": {
      description: "The officer is on the analytics command center, showing caseload mix, crime trend, risk forecast and early warnings.",
      placeholder: "Ask about these trends…",
      prompts: ["What is driving the crime trend?", "Which crime type is rising?", "Explain the early warnings"],
    },
    "/hotspots": {
      description: "The officer is on the hotspot risk map, showing geographic crime clusters and alert rankings.",
      placeholder: "Ask about hotspots…",
      prompts: ["Which zone is highest risk?", "Why is this zone flagged?", "Where should we patrol tonight?"],
    },
    "/early-warnings": {
      description: "The officer is reviewing active hotspot-derived early warnings and the jurisdiction crime-velocity forecast.",
      placeholder: "Ask about these warnings…",
      prompts: ["Why was the top warning triggered?", "Which patrol area needs attention?", "Explain the risk score"],
    },
    "/network": {
      description: "The officer is on the entity network canvas, exploring cross-case links between people, vehicles and cases.",
      placeholder: "Ask about these links…",
      prompts: ["Who connects the most cases?", "Are there any crime rings?", "Explain broker vs hub"],
    },
    "/fir/upload": {
      description: "The officer is registering a new FIR from a scanned document.",
      placeholder: "Ask about FIR intake…",
      prompts: ["What sections apply to theft?", "What evidence should I secure first?", "Draft an intake checklist"],
    },
    "/audit": {
      description: "The officer is reviewing the audit trail of queries, uploads and exports.",
      placeholder: "Ask about audit records…",
      prompts: ["What was exported recently?", "Who accessed this station's cases?"],
    },
  };

  const match = byPath[pathname];
  if (match) return { ...match, activeCaseId: null };

  return {
    description: `The officer is on the ${pathname} page of SCRB Sahayak.`,
    activeCaseId: null,
    placeholder: "Ask Sahayak anything…",
    prompts: DEFAULT_PROMPTS,
  };
}
