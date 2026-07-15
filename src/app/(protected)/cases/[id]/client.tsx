"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { Card, Badge, Button, IconOrb, SectionLabel } from "@/components/scrb/primitives";
import { cn } from "@/lib/utils";
import { useCopilotStore } from "@/lib/store";
import { PredictiveNextSteps } from "@/components/scrb/predictive-steps";
import { toast } from "sonner";

const TABS = [
  { id: "overview", label: "Overview", icon: FileText },
  { id: "timeline", label: "Timeline", icon: GitBranch },
  { id: "connections", label: "Connections", icon: Share2 },
  { id: "evidence", label: "Evidence", icon: ImageIcon },
  { id: "matches", label: "Matches", icon: Users },
] as const;

export default function CaseDossierClient({ caseData }: { caseData: any }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("overview");
  const [matches, setMatches] = useState(caseData.matches || []);
  const [busy, setBusy] = useState<string | null>(null);
  const { setPageContext, seedIntakeBrief, setActiveCaseId } = useCopilotStore();
  const router = useRouter();

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
  };

  const runIntakeInCopilot = async () => {
    setBusy("intake");
    try {
      const res = await fetch(`/api/cases/${caseData.id}/intake`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Intake failed");
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
        router.refresh();
      }
      router.push("/dashboard?intake=1");
    } catch (e: any) {
      toast.error(e.message || "Failed to run intake");
    } finally {
      setBusy(null);
    }
  };

  const draftUpdate = async () => {
    setBusy("draft");
    try {
      const res = await fetch(`/api/cases/${caseData.id}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience: "SP" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Draft failed");
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
      router.push("/dashboard?intake=1");
    } catch (e: any) {
      toast.error(e.message || "Failed to draft update");
    } finally {
      setBusy(null);
    }
  };

  const handleMatch = async (matchId: string, status: "CONFIRMED" | "REJECTED") => {
    setBusy(matchId);
    try {
      const res = await fetch(`/api/cases/${caseData.id}/matches`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
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
          href="/cases"
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
            <Overview c={c} rawExtractedText={caseData.rawExtractedText} />
          )}
          {tab === "timeline" && <Timeline caseData={caseData} />}
          {tab === "connections" && <Connections />}
          {tab === "evidence" && <Evidence />}
          {tab === "matches" && (
            <Matches matches={matches} busy={busy} onUpdate={handleMatch} />
          )}
        </div>
      </Card>
    </div>
  );
}

function Overview({ c, rawExtractedText }: { c: any; rawExtractedText?: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="glass rounded-3xl p-5 lg:col-span-2 space-y-6">
        <div>
          <SectionLabel className="mb-2">Summary</SectionLabel>
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
            {c.summary}
          </p>
        </div>

        {rawExtractedText && (
          <div>
            <SectionLabel className="mb-2">Extracted OCR Data</SectionLabel>
            <div className="glass rounded-2xl p-4 text-xs font-mono text-muted-foreground whitespace-pre-wrap max-h-64 overflow-y-auto custom-scrollbar">
              {rawExtractedText}
            </div>
          </div>
        )}
      </div>
      <div className="space-y-4">
        <PredictiveNextSteps caseId={c.id} />

        <div className="glass rounded-3xl p-5">
          <SectionLabel className="mb-2">Entities</SectionLabel>
          <ul className="space-y-2">
            {c.entities.map((e: string, i: number) => (
              <li key={i} className="glass rounded-2xl px-3 py-2 text-mono text-xs">
                {e}
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
      <Link href="/network" className="mt-3 inline-flex">
        <Button variant="secondary" size="sm">
          Open network canvas
        </Button>
      </Link>
    </div>
  );
}

function Evidence() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {[1, 2].map((i) => (
        <div key={i} className="glass rounded-3xl p-4">
          <div className="aspect-[4/5] rounded-2xl bg-gradient-to-br from-white/10 to-white/[0.02] p-4">
            <div className="h-full w-full rounded-xl border border-hairline bg-surface-2 p-3">
              <p className="text-mono text-[10px] text-muted-foreground">FIR ATTACHMENT #{i}</p>
              <div className="mt-2 space-y-1.5">
                {Array.from({ length: 8 }).map((_, k) => (
                  <div
                    key={k}
                    className="h-1.5 rounded bg-muted"
                    style={{ width: `${60 + ((i * k) % 40)}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Scanned statement · Page {i}</p>
        </div>
      ))}
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
