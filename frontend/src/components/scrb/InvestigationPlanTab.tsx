import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Download,
  FilePlus2,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  ShieldAlert,
} from "lucide-react";
import { apiRequest } from "@/api/client";
import { Badge, Button, SectionLabel } from "@/components/scrb/primitives";
import { toast } from "sonner";

type TaskStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "BLOCKED"
  | "NOT_APPLICABLE";

type InvestigationTask = {
  id: string;
  taskKey: string;
  phase: string;
  title: string;
  guidance: string;
  rationale?: string | null;
  status: TaskStatus;
  officerNotes?: string | null;
  documentTemplateKey?: string | null;
  updatedByName: string;
  updatedAt: string;
};

type InvestigationPlan = {
  id: string;
  profileCode: string;
  profileVersion: number;
  profileTitle: string;
  sourceStatus: string;
  disclaimer: string;
  tasks: InvestigationTask[];
  summary: Record<TaskStatus, number> & { total: number };
};

type DocumentTemplate = {
  key: string;
  title: string;
  language: string;
  requiredFields: string[];
  sourceStatus: string;
  templateVersion: number;
};

type RoutineDocument = {
  id: string;
  taskId?: string | null;
  templateKey: string;
  templateVersion: number;
  sourceStatus: string;
  title: string;
  content: string;
  updatedByName: string;
  updatedAt: string;
};

type PlanResponse = {
  plan: InvestigationPlan | null;
  availableProfile: {
    profileCode: string;
    profileVersion: number;
    profileTitle: string;
    sourceStatus: string;
    disclaimer: string;
    matchedCrimeProfile: string;
    matchedCrimeProfileTitle: string;
  };
  documentTemplates: DocumentTemplate[];
  documents: RoutineDocument[];
};

const PHASE_LABELS: Record<string, string> = {
  INITIAL_REVIEW: "Initial review",
  EARLY_ACTIONS: "Early actions",
  FOLLOW_UP: "Follow-up",
  SUPERVISORY_REVIEW: "Supervisory review",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  BLOCKED: "Blocked",
  NOT_APPLICABLE: "Not applicable",
};

const FIELD_LABELS: Record<string, string> = {
  recipient: "Recipient / office",
  recordsRequested: "Records or material to preserve",
  reason: "Officer-recorded reason and requested action",
  itemsForExamination: "Items selected for examination",
  questionsForExpert: "Questions for the expert",
  progressSummary: "Progress confirmed by the officer",
  openIssues: "Open issues or evidence gaps",
  proposedNextActions: "Proposed next actions for review",
};

const fieldClass =
  "w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-teal focus:ring-1 focus:ring-teal disabled:opacity-60";

function statusTone(status: TaskStatus): "neutral" | "amber" | "teal" | "danger" | "muted" {
  if (status === "COMPLETED") return "teal";
  if (status === "BLOCKED") return "danger";
  if (status === "IN_PROGRESS") return "amber";
  if (status === "NOT_APPLICABLE") return "muted";
  return "neutral";
}

export function InvestigationPlanTab({ caseId, canEdit }: { caseId: string; canEdit: boolean }) {
  const [result, setResult] = useState<PlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>({});
  const [taskNotes, setTaskNotes] = useState<Record<string, string>>({});
  const [documentContents, setDocumentContents] = useState<Record<string, string>>({});
  const [activeTemplateKey, setActiveTemplateKey] = useState("");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [documentInputs, setDocumentInputs] = useState<Record<string, string>>({});

  const install = useCallback((next: PlanResponse) => {
    setResult(next);
    setTaskStatuses(
      Object.fromEntries((next.plan?.tasks || []).map((task) => [task.id, task.status]))
    );
    setTaskNotes(
      Object.fromEntries((next.plan?.tasks || []).map((task) => [task.id, task.officerNotes || ""]))
    );
    setDocumentContents(
      Object.fromEntries(next.documents.map((document) => [document.id, document.content]))
    );
    setActiveTemplateKey((current) => current || next.documentTemplates[0]?.key || "");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      install(
        await apiRequest(`/api/cases/${caseId}/investigation-plan`, { fresh: true })
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load the investigation plan.");
    } finally {
      setLoading(false);
    }
  }, [caseId, install]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeTemplate = useMemo(
    () => result?.documentTemplates.find((template) => template.key === activeTemplateKey),
    [activeTemplateKey, result]
  );

  const groupedTasks = useMemo(() => {
    const groups = new Map<string, InvestigationTask[]>();
    for (const task of result?.plan?.tasks || []) {
      groups.set(task.phase, [...(groups.get(task.phase) || []), task]);
    }
    return [...groups.entries()];
  }, [result]);

  const initialize = async () => {
    setBusy("initialize");
    setError("");
    try {
      await apiRequest(`/api/cases/${caseId}/investigation-plan/initialize`, {
        method: "POST",
      });
      await load();
      toast.success("Provisional investigation plan created for this test case.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to initialize the plan.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const saveTask = async (task: InvestigationTask) => {
    setBusy(task.id);
    try {
      await apiRequest(`/api/cases/${caseId}/investigation-plan/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: taskStatuses[task.id] || task.status,
          officerNotes: taskNotes[task.id] || null,
        }),
      });
      await load();
      toast.success("Investigation task updated and recorded in the audit trail.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Failed to update the task.");
    } finally {
      setBusy(null);
    }
  };

  const openTemplate = (templateKey: string, taskId?: string) => {
    setActiveTemplateKey(templateKey);
    setActiveTaskId(taskId || null);
    document.getElementById("routine-document-builder")?.scrollIntoView({ behavior: "smooth" });
  };

  const createDocument = async () => {
    if (!activeTemplate) return;
    setBusy("create-document");
    try {
      await apiRequest(`/api/cases/${caseId}/investigation-plan/documents`, {
        method: "POST",
        body: JSON.stringify({
          templateKey: activeTemplate.key,
          taskId: activeTaskId,
          inputs: documentInputs,
        }),
      });
      setDocumentInputs({});
      setActiveTaskId(null);
      await load();
      toast.success("Editable demo draft created. It has not been filed or sent.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Failed to create the draft.");
    } finally {
      setBusy(null);
    }
  };

  const saveDocument = async (document: RoutineDocument) => {
    setBusy(document.id);
    try {
      await apiRequest(
        `/api/cases/${caseId}/investigation-plan/documents/${document.id}`,
        {
          method: "PUT",
          body: JSON.stringify({ content: documentContents[document.id] }),
        }
      );
      await load();
      toast.success("Demo draft saved. It remains unfiled and untransmitted.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Failed to save the draft.");
    } finally {
      setBusy(null);
    }
  };

  const copyDocument = async (document: RoutineDocument) => {
    try {
      await navigator.clipboard.writeText(documentContents[document.id] || document.content);
      toast.success("Draft copied with its non-official label.");
    } catch {
      toast.error("The browser did not allow copying this draft.");
    }
  };

  const downloadDocument = (document: RoutineDocument) => {
    const content = documentContents[document.id] || document.content;
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${document.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-demo.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !result) {
    return (
      <div className="flex items-center justify-center rounded-3xl border border-hairline p-12">
        <Loader2 className="h-6 w-6 animate-spin text-teal" />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="rounded-3xl border border-danger/30 bg-danger/5 p-6 text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-danger" />
        <p className="mt-3 font-semibold">Investigation plan could not be loaded</p>
        <p className="mt-1 text-xs text-muted-foreground">{error}</p>
        <Button className="mt-4" variant="secondary" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" /> Retry
        </Button>
      </div>
    );
  }

  const plan = result.plan;
  const handled = plan ? plan.summary.COMPLETED + plan.summary.NOT_APPLICABLE : 0;
  const progress = plan?.summary.total ? Math.round((handled / plan.summary.total) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber/40 bg-amber/10 p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">Provisional hackathon workflow</p>
              <Badge tone="amber">Not an official procedure</Badge>
            </div>
            <p className="mt-1 max-w-4xl text-xs leading-relaxed text-muted-foreground">
              {plan?.disclaimer || result.availableProfile.disclaimer}
            </p>
          </div>
        </div>
      </div>

      {!plan ? (
        <div className="rounded-3xl border border-hairline bg-surface p-6">
          <SectionLabel>Available demonstration profile</SectionLabel>
          <h2 className="mt-2 text-lg font-semibold">{result.availableProfile.profileTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.availableProfile.matchedCrimeProfileTitle} · {result.availableProfile.profileCode} v{result.availableProfile.profileVersion}
          </p>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Initializing saves a checklist snapshot for this case. Future edits to the demo registry will not silently rewrite work already recorded by an officer.
          </p>
          {error && <p className="mt-3 text-xs text-danger">{error}</p>}
          {canEdit ? (
            <Button
              className="mt-5"
              variant="primary"
              onClick={() => void initialize()}
              disabled={busy === "initialize"}
            >
              {busy === "initialize" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Initialize provisional plan
            </Button>
          ) : (
            <p className="mt-4 text-xs text-muted-foreground">
              The assigned Investigating Officer can initialize this plan.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-hairline bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{plan.profileTitle}</h2>
                  <Badge tone="muted">{plan.profileCode} v{plan.profileVersion}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {handled} of {plan.summary.total} tasks handled · {plan.summary.BLOCKED} blocked
                </p>
              </div>
              <span className="text-mono text-sm font-semibold text-teal">{progress}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-teal transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {groupedTasks.map(([phase, tasks]) => (
            <section key={phase} className="space-y-3">
              <SectionLabel>{PHASE_LABELS[phase] || phase.replaceAll("_", " ")}</SectionLabel>
              {tasks.map((task) => (
                <div key={task.id} className="rounded-2xl border border-hairline bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">{task.title}</h3>
                        <Badge tone={statusTone(taskStatuses[task.id] || task.status)}>
                          {STATUS_LABELS[taskStatuses[task.id] || task.status]}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{task.guidance}</p>
                      {task.rationale && (
                        <p className="mt-2 text-xs italic text-muted-foreground">Why shown: {task.rationale}</p>
                      )}
                    </div>
                    {task.documentTemplateKey && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openTemplate(task.documentTemplateKey as string, task.id)}
                      >
                        <FilePlus2 className="h-4 w-4" /> Draft related document
                      </Button>
                    )}
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-[190px_1fr_auto]">
                    <select
                      className={fieldClass}
                      value={taskStatuses[task.id] || task.status}
                      disabled={!canEdit}
                      onChange={(event) =>
                        setTaskStatuses((current) => ({
                          ...current,
                          [task.id]: event.target.value as TaskStatus,
                        }))
                      }
                    >
                      {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((status) => (
                        <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                      ))}
                    </select>
                    <input
                      className={fieldClass}
                      value={taskNotes[task.id] || ""}
                      disabled={!canEdit}
                      maxLength={4000}
                      placeholder="Officer note, reference, blocker, or reason for not applicable"
                      onChange={(event) =>
                        setTaskNotes((current) => ({ ...current, [task.id]: event.target.value }))
                      }
                    />
                    {canEdit && (
                      <Button
                        variant="secondary"
                        onClick={() => void saveTask(task)}
                        disabled={busy === task.id}
                      >
                        {busy === task.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </section>
          ))}

          <section id="routine-document-builder" className="rounded-3xl border border-hairline bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-teal" />
                  <h2 className="font-semibold">Routine document draft builder</h2>
                  <Badge tone="amber">Demo formats</Badge>
                </div>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                  Case details are filled from saved records; the officer supplies the decision-specific text. The system does not send, file, approve, or sign the result.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Draft type
                <select
                  className={fieldClass}
                  value={activeTemplateKey}
                  disabled={!canEdit}
                  onChange={(event) => {
                    setActiveTemplateKey(event.target.value);
                    setActiveTaskId(null);
                  }}
                >
                  {result.documentTemplates.map((template) => (
                    <option key={template.key} value={template.key}>{template.title}</option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {activeTemplate?.requiredFields.map((field) => (
                  <label key={field} className="space-y-1 text-xs font-medium text-muted-foreground">
                    {FIELD_LABELS[field] || field}
                    <textarea
                      className={`${fieldClass} min-h-20 resize-y`}
                      value={documentInputs[field] || ""}
                      disabled={!canEdit}
                      maxLength={5000}
                      onChange={(event) =>
                        setDocumentInputs((current) => ({ ...current, [field]: event.target.value }))
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
            {activeTaskId && (
              <p className="mt-3 text-xs text-teal">This draft will be linked to the selected investigation task.</p>
            )}
            {canEdit && (
              <Button
                className="mt-4"
                variant="primary"
                onClick={() => void createDocument()}
                disabled={!activeTemplate || busy === "create-document"}
              >
                {busy === "create-document" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
                Create editable demo draft
              </Button>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionLabel>Saved working drafts</SectionLabel>
              <Badge tone="muted">{result.documents.length}</Badge>
            </div>
            {result.documents.map((document) => (
              <div key={document.id} className="rounded-2xl border border-hairline bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{document.title}</h3>
                      <Badge tone="amber">Not official</Badge>
                      <Badge tone="muted">v{document.templateVersion}</Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Last edited by {document.updatedByName} · {new Date(document.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => void copyDocument(document)}>
                      <ClipboardCopy className="h-4 w-4" /> Copy
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => downloadDocument(document)}>
                      <Download className="h-4 w-4" /> Download .txt
                    </Button>
                    {canEdit && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy === document.id}
                        onClick={() => void saveDocument(document)}
                      >
                        {busy === document.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save draft
                      </Button>
                    )}
                  </div>
                </div>
                <textarea
                  className={`${fieldClass} mt-4 min-h-72 resize-y font-mono text-xs leading-relaxed`}
                  value={documentContents[document.id] || ""}
                  disabled={!canEdit}
                  maxLength={30000}
                  onChange={(event) =>
                    setDocumentContents((current) => ({ ...current, [document.id]: event.target.value }))
                  }
                />
              </div>
            ))}
            {result.documents.length === 0 && (
              <div className="rounded-2xl border border-dashed border-hairline p-8 text-center text-sm text-muted-foreground">
                No routine document drafts have been created for this case.
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
