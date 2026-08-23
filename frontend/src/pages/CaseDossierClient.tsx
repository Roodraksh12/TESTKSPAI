"use client";

import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest } from "@/api/client";
import {
  ArrowLeft,
  Check,
  X,
  FileText,
  Users,
  Share2,
  Image as ImageIcon,
  GitBranch,
  Sparkles,
  Loader2,
  ShieldAlert,
  ScrollText,
  BookOpen,
  Timer,
} from "lucide-react";
import { Card, Badge, Button, IconOrb, SectionLabel } from "@/components/scrb/primitives";
import { cn } from "@/lib/utils";
import { useCopilotStore } from "@/lib/store";
import { PredictiveNextSteps } from "@/components/scrb/predictive-steps";
import { LegalSectionsPanel } from "@/components/scrb/legal-sections-panel";
import { toast } from "sonner";
import { ChargesheetEditor } from "@/components/scrb/ChargesheetEditor";
import { CaseDiaryTab } from "@/components/scrb/CaseDiaryTab";
import { EvidenceTab } from "@/components/scrb/EvidenceTab";
import { EvidenceForm } from "@/components/scrb/EvidenceForm";
import { HighlightText } from "@/components/scrb/HighlightText";

const TABS = [
  { id: "overview", label: "Overview", icon: FileText },
  { id: "timeline", label: "Timeline", icon: GitBranch },
  { id: "diary", label: "Case Diary", icon: BookOpen },
  { id: "connections", label: "Connections", icon: Share2 },
  { id: "evidence", label: "Evidence", icon: ImageIcon },
  { id: "matches", label: "Matches", icon: Users },
] as const;

export default function CaseDossierClient({ caseData }: { caseData: any }) {
  const [searchParams] = useSearchParams();
  const highlight = searchParams.get("highlight");

  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("overview");
  const [matches, setMatches] = useState(caseData.matches || []);
  const [busy, setBusy] = useState<string | null>(null);
  const [showChargesheet, setShowChargesheet] = useState(false);
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [refreshEvidence, setRefreshEvidence] = useState(0);
  const { setPageContext, seedIntakeBrief, setActiveCaseId } = useCopilotStore();
  const navigate = useNavigate();

  useEffect(() => {
    setPageContext(
      JSON.stringify(
        {
          activeCaseId: caseData.id,
          firNumber: caseData.firNumber,
          crimeType: caseData.crimeType,
          status: caseData.status,
          summary: caseData.summary,
          persons: caseData.casePersons?.map((cp: any) => ({
            name: cp.person.name,
            role: cp.role,
          })),
        },
        null,
        2
      )
    );
    setActiveCaseId(caseData.id);
    return () => {
      setPageContext("");
    };
  }, [caseData, setPageContext, setActiveCaseId]);

  const c = {
    id: caseData.id,
    firNumber: caseData.firNumber,
    title: caseData.summary ? caseData.summary.substring(0, 40) + "..." : caseData.crimeType,
    station: caseData.station?.name || "Station",
    location: "Jurisdiction",
    crimeType: caseData.crimeType,
    date: new Date(caseData.reportedDate).toLocaleDateString(),
    status: caseData.status,
    summary: caseData.summary || "No summary provided.",
    entities: caseData.casePersons.map((cp: any) => cp.person.name),
    matches,
    casePersons: caseData.casePersons,
  };

  // 60/90 Day FR Timer logic
  let frDeadlineDays = null;
  let daysRemaining = null;
  let isOverdue = false;
  
  if (c.casePersons) {
    const custodyDates = c.casePersons
      .filter((cp: any) => cp.person.custodyStartDate)
      .map((cp: any) => new Date(cp.person.custodyStartDate).getTime());
    
    if (custodyDates.length > 0) {
      const firstCustodyDate = new Date(Math.min(...custodyDates));
      // For simplicity, using 90 days as standard statutory limit for major crimes
      const statutoryLimitDays = 90; 
      const deadlineDate = new Date(firstCustodyDate.getTime() + (statutoryLimitDays * 24 * 60 * 60 * 1000));
      const now = new Date();
      const diffTime = deadlineDate.getTime() - now.getTime();
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      frDeadlineDays = statutoryLimitDays;
      isOverdue = daysRemaining < 0;
    }
  }

  const runIntakeInCopilot = async () => {
    setBusy("intake");
    try {
      const data = await apiRequest(`/api/cases/${caseData.id}/intake`);
      seedIntakeBrief({
        caseId: caseData.id,
        markdown: data.intake.markdown,
        actionPrompts: data.intake.actionPrompts,
        pageContext: JSON.stringify({
          activeCaseId: caseData.id,
          firNumber: caseData.firNumber,
          source: "CASE_DOSSIER_INTAKE",
        }),
      });
      if (data.intake.identityMatches || data.intake.moSimilar) {
        // refresh matches from server by reloading dossier matches tab data
      }
      navigate("/dashboard?intake=1");
    } catch (e: any) {
      toast.error(e.message || "Failed to run intake");
    } finally {
      setBusy(null);
    }
  };

  const draftUpdate = async () => {
    setBusy("draft");
    try {
      const data = await apiRequest(`/api/cases/${caseData.id}/draft`, {
        method: "POST",
        body: JSON.stringify({ audience: "SP" }),
      });
      seedIntakeBrief({
        caseId: caseData.id,
        markdown: `## Draft SP progress note\n\n\`\`\`\n${data.draft}\n\`\`\`\n\n_Draft only — edit before filing. Nothing was written to the case diary automatically._`,
        actionPrompts: [
          "Expand next actions for 72 hours",
          "Suggest legal sections for this case",
          "Show pending identity matches",
          "Run full intake on this case",
        ],
        pageContext: JSON.stringify({
          activeCaseId: caseData.id,
          firNumber: caseData.firNumber,
          source: "DRAFT_UPDATE",
        }),
      });
      navigate("/dashboard?intake=1");
    } catch (e: any) {
      toast.error(e.message || "Failed to draft update");
    } finally {
      setBusy(null);
    }
  };

  const handleMatch = async (matchId: string, status: "CONFIRMED" | "REJECTED") => {
    setBusy(matchId);
    try {
      await apiRequest(`/api/cases/${caseData.id}/matches`, {
        method: "PATCH",
        body: JSON.stringify({ matchId, status }),
      });
      setMatches((prev: any[]) =>
        prev.map((m) => (m.id === matchId ? { ...m, status } : m))
      );
      toast.success(status === "CONFIRMED" ? "Match confirmed" : "Match rejected");
    } catch (e: any) {
      toast.error(e.message || "Failed to update match");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/cases"
          className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All cases
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={c.status === "OPEN" || c.status === "UNDER_INVESTIGATION" ? "teal" : "amber"}>
            {c.status.replace("_", " ")}
          </Badge>
          <Badge tone="muted">
            <span className="text-mono">{c.firNumber}</span>
          </Badge>
          {daysRemaining !== null && (
            <Badge tone={isOverdue ? "danger" : daysRemaining < 15 ? "amber" : "teal"} className="flex items-center gap-1 border-current">
              <Timer className="w-3 h-3" />
              {isOverdue ? `FR Overdue by ${Math.abs(daysRemaining)} days` : `FR Due in ${daysRemaining} days`}
            </Badge>
          )}
        </div>
      </div>

      <Card accent="teal" className="p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <SectionLabel className="mb-2">
              {c.station} · {c.location}
            </SectionLabel>
            <h1 className="text-display mt-1 text-3xl">{c.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {c.crimeType} · Reported {c.date}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="md"
              onClick={() => setShowEvidenceForm(true)}
            >
              <ImageIcon className="h-4 w-4 mr-1.5" />
              Add/Update Evidence
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={runIntakeInCopilot}
              disabled={busy === "intake"}
            >
              {busy === "intake" ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1.5" />
              )}
              Run intake in Copilot
            </Button>
            <Button variant="primary" size="md" onClick={draftUpdate} disabled={busy === "draft"}>
              {busy === "draft" ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : null}
              Draft update
            </Button>
            <Link to={`/cases/${caseData.id}/tactical`}>
              <Button variant="secondary" size="md">
                <ShieldAlert className="h-4 w-4 mr-1.5" />
                Tactical view
              </Button>
            </Link>
            <Button variant="secondary" size="md" onClick={() => setShowChargesheet(true)}>
              <ScrollText className="h-4 w-4 mr-1.5" />
              FR - Final Report
            </Button>
          </div>
        </div>

        <div className="glass mt-6 inline-flex rounded-2xl p-1 overflow-x-auto max-w-full custom-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition whitespace-nowrap",
                tab === t.id
                  ? "bg-muted text-foreground shadow-inner"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
              {t.id === "matches" && matches.filter((m: any) => m.status === "PENDING").length > 0 && (
                <span className="ml-1 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 px-1.5 text-[10px]">
                  {matches.filter((m: any) => m.status === "PENDING").length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === "overview" && (
            <Overview c={c} rawExtractedText={caseData.rawExtractedText} highlight={highlight} />
          )}
          {tab === "timeline" && <Timeline caseData={caseData} />}
          {tab === "diary" && <CaseDiaryTab caseId={c.id} />}
          {tab === "connections" && <Connections />}
          {tab === "evidence" && <EvidenceTab caseId={c.id} key={refreshEvidence} />}
          {tab === "matches" && (
            <Matches matches={matches} busy={busy} onUpdate={handleMatch} />
          )}
        </div>
      </Card>
      <ChargesheetEditor
        caseId={c.id}
        isOpen={showChargesheet}
        onClose={() => setShowChargesheet(false)}
      />
      <EvidenceForm
        caseId={c.id}
        isOpen={showEvidenceForm}
        onClose={() => setShowEvidenceForm(false)}
        onSuccess={() => {
          setShowEvidenceForm(false);
          setRefreshEvidence(prev => prev + 1);
        }}
      />
    </div>
  );
}

function Overview({ c, rawExtractedText, highlight }: { c: any; rawExtractedText?: string; highlight?: string | null }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="glass rounded-3xl p-5 lg:col-span-2 space-y-6">
        <div>
          <SectionLabel className="mb-2">Summary</SectionLabel>
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
            <HighlightText text={c.summary} query={highlight} />
          </p>
        </div>

        {rawExtractedText && (
          <div>
            <SectionLabel className="mb-2">Extracted OCR Data</SectionLabel>
            <div className="glass rounded-2xl p-4 text-xs font-mono text-muted-foreground whitespace-pre-wrap max-h-64 overflow-y-auto custom-scrollbar">
              <HighlightText text={rawExtractedText} query={highlight} />
            </div>
          </div>
        )}
      </div>
      <div className="space-y-4">
        <PredictiveNextSteps caseId={c.id} />

        <LegalSectionsPanel caseId={c.id} />

        <div className="glass rounded-3xl p-5">
          <SectionLabel className="mb-2">Entities</SectionLabel>
          <ul className="space-y-2">
            {c.entities.map((e: string, i: number) => (
              <li key={i} className="glass rounded-2xl px-3 py-2 text-mono text-xs">
                <HighlightText text={e} query={highlight} />
              </li>
            ))}
            {c.entities.length === 0 && (
              <li className="text-xs text-muted-foreground">No entities extracted.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Timeline({ caseData }: { caseData: any }) {
  const items = [
    { date: new Date(caseData.incidentDate), label: "Incident occurred" },
    { date: new Date(caseData.reportedDate), label: "FIR Registered" },
  ];
  return (
    <ol className="relative ml-4 space-y-4 border-l border-hairline pl-6">
      {items.map((i, idx) => (
        <li key={idx} className="relative">
          <span className="absolute -left-[30px] top-1.5 h-3 w-3 rounded-full bg-amber shadow-[0_0_0_4px_color-mix(in_oklab,var(--amber)_25%,transparent)]" />
          <div className="glass rounded-2xl p-4">
            <p className="text-mono text-[11px] text-muted-foreground">
              {i.date.toLocaleDateString()} ·{" "}
              {i.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
            <p className="mt-1 text-sm">{i.label}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Connections() {
  return (
    <div className="glass rounded-3xl p-4">
      <p className="text-sm text-muted-foreground">
        Interactive graph available on the Network canvas.
      </p>
      <Link to="/network" className="mt-3 inline-flex">
        <Button variant="secondary" size="sm">
          Open network canvas
        </Button>
      </Link>
    </div>
  );
}

function Matches({
  matches,
  busy,
  onUpdate,
}: {
  matches: any[];
  busy: string | null;
  onUpdate: (matchId: string, status: "CONFIRMED" | "REJECTED") => void;
}) {
  if (!matches || matches.length === 0) {
    return (
      <div className="glass rounded-3xl p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">No cross-case matches detected yet.</p>
        <p className="text-xs text-muted-foreground">
          Use <strong>Run intake in Copilot</strong> to scan identity and MO leads.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {matches.map((m: any) => {
        const name =
          m.matchedCase?.firNumber || m.matchedPerson?.name || "Behavioral / MO match";
        const isMoMatch = String(m.reason || "").includes("MO_SIMILAR") ||
          String(m.reason || "").includes("Behavioral");
        const status = m.status || "PENDING";

        return (
          <div key={m.id} className="glass flex flex-wrap items-center gap-3 rounded-3xl p-4">
            <IconOrb tone={isMoMatch ? "amber" : "teal"} size="sm">
              <Users className="h-3.5 w-3.5" />
            </IconOrb>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-mono text-sm">{name}</p>
                <Badge
                  tone={
                    status === "CONFIRMED" ? "teal" : status === "REJECTED" ? "muted" : "amber"
                  }
                >
                  {status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{m.reason}</p>
            </div>
            <div className="w-40">
              <div className="h-1.5 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-teal"
                  style={{ width: `${m.confidenceScore}%` }}
                />
              </div>
              <p className="mt-1 text-right text-[10px] text-muted-foreground">
                {m.confidenceScore}% match · lead only
              </p>
            </div>
            {status === "PENDING" && (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy === m.id}
                  onClick={() => onUpdate(m.id, "CONFIRMED")}
                  className="glass inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs hover:brightness-125 disabled:opacity-50"
                >
                  {busy === m.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}{" "}
                  Confirm
                </button>
                <button
                  type="button"
                  disabled={busy === m.id}
                  onClick={() => onUpdate(m.id, "REJECTED")}
                  className="glass inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:brightness-125 disabled:opacity-50"
                >
                  <X className="h-3 w-3" /> Reject
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
