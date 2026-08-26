import { useEffect, useMemo, useState } from "react";
import { apiFetchResponse, apiRequest } from "@/api/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileClock,
  FileText,
  History,
  Link2,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  Save,
  Scale,
  Send,
  ShieldAlert,
  Trash2,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/scrb/primitives";
import { cn } from "@/lib/utils";

interface ChargesheetEditorProps {
  caseId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

type ReportStatus = "DRAFT" | "READY_FOR_REVIEW" | "RETURNED" | "APPROVED" | "FILED";

interface ValidationIssue {
  key: string;
  code: string;
  severity: "ERROR" | "EXPLANATION" | "ADVISORY";
  message: string;
  path: string;
  explanation?: string;
}

interface ValidationResult {
  ready: boolean;
  counts: {
    errors: number;
    explanations: number;
    unansweredExplanations: number;
    advisories: number;
  };
  issues: ValidationIssue[];
  checkedAt?: string;
}

interface PersonRow {
  key: string;
  sourceCasePersonId?: string | null;
  sourcePersonId?: string | null;
  selected: boolean;
  name: string;
  phone?: string;
  address?: string;
  custodyStatus?: string;
  firstRemandAt?: string | null;
  bailStatus?: string;
  allegation?: string;
  statementSummary?: string;
  alias?: string;
  parentName?: string;
  birthYear?: string;
  gender?: string;
  nationality?: string;
  occupation?: string;
  permanentAddress?: string;
  identityStatus?: string;
  identityType?: string;
  identityReference?: string;
  disposition?: string;
  dispositionReason?: string;
  arrestAt?: string;
  bailAt?: string;
  forwardedToCourtAt?: string;
  regularCriminalNumber?: string;
  previousConvictions?: string;
  suretyDetails?: string;
  evidenceType?: string;
  relationshipName?: string;
  injuryOrLoss?: string;
  isManual?: boolean;
}

interface OffenceRow {
  key: string;
  catalogId?: string | null;
  selected: boolean;
  suggested?: boolean;
  actCode: string;
  sectionNumber: string;
  title: string;
  punishment?: string;
  conditionNote?: string;
  firStage?: string;
  finalDecision?: string;
  decisionReason?: string;
  approvalReference?: string;
  isManual?: boolean;
}

interface EvidenceRow {
  key: string;
  sourceEvidenceId: string;
  selected: boolean;
  type: string;
  description: string;
  status?: string;
  timestamp?: string;
  resultStatus?: string;
  resultSummary?: string;
  referenceNumber?: string;
}

interface DocumentRow {
  key: string;
  sourceDocumentId: string;
  selected: boolean;
  name: string;
  category?: string;
  createdAt?: string;
  sequenceNumber?: number;
  annexureNumber?: string;
  pageCount?: number;
  copyType?: string;
  description?: string;
}

interface ReportMetadata {
  templateProfile: string;
  legalRegime: string;
  finalReportNumber: string;
  finalReportDate: string;
  reportCategory: string;
  courtName: string;
  filingPlace: string;
}

interface ComplainantRow {
  sourceCasePersonId?: string | null;
  sourcePersonId?: string | null;
  name: string;
  phone?: string;
  address?: string;
  relationshipToVictim?: string;
  verificationStatus?: string;
  isManual?: boolean;
}

interface PropertyRow {
  key: string;
  selected: boolean;
  sourceEvidenceId?: string | null;
  category: string;
  description: string;
  quantity?: string;
  estimatedValue?: string;
  recoveryStatus?: string;
  recoveredAt?: string;
  seizureMemoReference?: string;
  disposalStatus?: string;
}

interface ExpertResultRow {
  key: string;
  sourceDocumentId?: string | null;
  type: string;
  status: string;
  referenceNumber?: string;
  resultDate?: string;
  summary?: string;
}

interface MatrixRow {
  key: string;
  accusedKey: string;
  offenceKey: string;
  facts: string;
  evidenceKeys: string[];
  witnessKeys: string[];
}

interface FinalReportPayload {
  schemaVersion: number;
  sourceRevision?: number;
  reportType: string;
  reportMetadata?: ReportMetadata;
  caseDetails: Record<string, unknown>;
  complainant?: ComplainantRow;
  victims?: PersonRow[];
  accused: PersonRow[];
  offences: OffenceRow[];
  witnesses: PersonRow[];
  evidence: EvidenceRow[];
  documents: DocumentRow[];
  propertyItems?: PropertyRow[];
  expertResults?: ExpertResultRow[];
  allegationMatrix: MatrixRow[];
  narrative: Record<string, string>;
  issueExplanations: Record<string, string>;
  officerDeclaration: boolean;
  preparedAt?: string;
}

interface FinalReport {
  id: string;
  status: ReportStatus;
  formatVersion: string;
  revision: number;
  versionNumber: number;
  payload: FinalReportPayload;
  validation: ValidationResult;
  reviewNote?: string | null;
  createdByName?: string;
  updatedByName?: string;
  reviewedByName?: string | null;
  approvedByName?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  updatedAt?: string;
}

interface ReportResponse {
  storageReady: boolean;
  report: FinalReport | null;
  context?: Record<string, unknown>;
}

interface VersionRow {
  id: string;
  versionNumber: number;
  event: string;
  status: string;
  changedSections: string[];
  createdAt: string;
  createdByName: string;
  createdByBadgeId?: string;
}

const steps = [
  { id: "case", label: "Case", icon: FileText },
  { id: "accused", label: "Accused", icon: UserRound },
  { id: "sections", label: "Sections & facts", icon: Scale },
  { id: "sources", label: "Sources", icon: Link2 },
  { id: "narrative", label: "Narrative", icon: BookOpenCheck },
  { id: "review", label: "Review & submit", icon: ClipboardCheck },
] as const;

const narrativeFields = [
  ["caseBackground", "Case background", "Concise facts that led to registration of the case."],
  ["informationReceived", "Information received", "How and when the information was received and registered."],
  ["investigationConducted", "Investigation conducted", "Chronological investigative actions actually recorded in the case."],
  ["evidenceSummary", "Evidence summary", "How the selected statements, material and documents support the case."],
  ["conclusion", "Investigation conclusion", "The conclusion reached from the verified record."],
  ["prayer", "Submission / prayer", "The action requested from the competent Court."],
] as const;

const documentCategories = [
  "FIR",
  "COMPLAINT",
  "STATEMENT",
  "SEIZURE_RECORD",
  "FORENSIC_REPORT",
  "MEDICAL_REPORT",
  "ARREST_REMAND",
  "SITE_PLAN",
  "OTHER",
];

const emptyValidation: ValidationResult = {
  ready: false,
  counts: { errors: 0, explanations: 0, unansweredExplanations: 0, advisories: 0 },
  issues: [],
};

function clonePayload(payload: FinalReportPayload): FinalReportPayload {
  return JSON.parse(JSON.stringify(payload));
}

function localKey(prefix: string) {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function displayDate(value?: string | null) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function statusLabel(status: ReportStatus) {
  return status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status: ReportStatus): "neutral" | "amber" | "teal" | "danger" | "muted" {
  if (status === "APPROVED" || status === "FILED") return "teal";
  if (status === "RETURNED") return "danger";
  if (status === "READY_FOR_REVIEW") return "amber";
  return "muted";
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-semibold text-foreground">{children}</label>;
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-teal focus:ring-1 focus:ring-teal disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70",
        props.className,
      )}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full resize-y rounded-lg border border-hairline bg-surface px-3 py-2 text-sm leading-relaxed text-foreground outline-none transition focus:border-teal focus:ring-1 focus:ring-teal disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70",
        props.className,
      )}
    />
  );
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-teal focus:ring-1 focus:ring-teal disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70",
        props.className,
      )}
    />
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5">
      <h3 className="text-xl font-semibold tracking-tight text-foreground">{title}</h3>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

export function ChargesheetEditor({ caseId, isOpen, onClose }: ChargesheetEditorProps) {
  const [result, setResult] = useState<ReportResponse | null>(null);
  const [payload, setPayload] = useState<FinalReportPayload | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [offenceSearch, setOffenceSearch] = useState("");
  const [matrixAccusedKey, setMatrixAccusedKey] = useState("");
  const [matrixOffenceKey, setMatrixOffenceKey] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const report = result?.report || null;
  const editable = report ? ["DRAFT", "RETURNED"].includes(report.status) : false;
  const validation = report?.validation || emptyValidation;

  const installResult = (next: ReportResponse) => {
    setResult(next);
    setPayload(next.report ? clonePayload(next.report.payload) : null);
    setDirty(false);
  };

  const load = async () => {
    if (!caseId) return;
    setLoading(true);
    setError("");
    try {
      const next = await apiRequest(`/api/cases/${caseId}/final-report`, { fresh: true });
      installResult(next);
      if (next.report) {
        const history = await apiRequest(`/api/cases/${caseId}/final-report/versions`, { fresh: true });
        setVersions(history.versions || []);
      } else {
        setVersions([]);
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Failed to load the final report.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !caseId) return;
    setStepIndex(0);
    setResult(null);
    setPayload(null);
    setVersions([]);
    setDirty(false);
    setSuccess("");
    void load();
  }, [caseId, isOpen]);

  const mutate = (recipe: (next: FinalReportPayload) => void) => {
    if (!payload || !editable) return;
    const next = clonePayload(payload);
    recipe(next);
    setPayload(next);
    setDirty(true);
    setSuccess("");
  };

  const patchPerson = (collection: "accused" | "witnesses", key: string, changes: Partial<PersonRow>) => {
    mutate((next) => {
      const row = next[collection].find((item) => item.key === key);
      if (row) Object.assign(row, changes);
    });
  };

  const patchOffence = (key: string, changes: Partial<OffenceRow>) => {
    mutate((next) => {
      const row = next.offences.find((item) => item.key === key);
      if (row) Object.assign(row, changes);
    });
  };

  const initialize = async () => {
    if (!caseId) return;
    setWorking(true);
    setError("");
    try {
      const next = await apiRequest(`/api/cases/${caseId}/final-report/initialize`, { method: "POST" });
      installResult(next);
      setSuccess("Structured draft initialized from the case record. No AI service was used.");
      const history = await apiRequest(`/api/cases/${caseId}/final-report/versions`, { fresh: true });
      setVersions(history.versions || []);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Failed to initialize the report.");
    } finally {
      setWorking(false);
    }
  };

  const save = async () => {
    if (!caseId || !report || !payload) return;
    setWorking(true);
    setError("");
    setSuccess("");
    try {
      const next = await apiRequest(`/api/cases/${caseId}/final-report`, {
        method: "PUT",
        body: JSON.stringify({ expectedRevision: report.revision, payload }),
      });
      installResult(next);
      setSuccess("Saved and validated as a new immutable version.");
      const history = await apiRequest(`/api/cases/${caseId}/final-report/versions`, { fresh: true });
      setVersions(history.versions || []);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Failed to save the report.");
    } finally {
      setWorking(false);
    }
  };

  const refreshCaseData = async () => {
    if (!caseId || !report || dirty) return;
    setWorking(true);
    setError("");
    setSuccess("");
    try {
      const next = await apiRequest(`/api/cases/${caseId}/final-report/refresh-sources`, {
        method: "POST",
        body: JSON.stringify({ expectedRevision: report.revision }),
      });
      installResult(next);
      setSuccess("Current case records were imported into empty report fields. Existing officer edits were preserved.");
      const history = await apiRequest(`/api/cases/${caseId}/final-report/versions`, { fresh: true });
      setVersions(history.versions || []);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Failed to refresh case data.");
    } finally {
      setWorking(false);
    }
  };

  const transition = async (action: "submit-review" | "approve" | "return") => {
    if (!caseId) return;
    setWorking(true);
    setError("");
    setSuccess("");
    try {
      const options = action === "return"
        ? { method: "POST", body: JSON.stringify({ note: reviewNote }) }
        : { method: "POST" };
      const next = await apiRequest(`/api/cases/${caseId}/final-report/${action}`, options);
      installResult(next);
      setReviewNote("");
      setSuccess(
        action === "submit-review"
          ? "Report locked and sent for supervisory review."
          : action === "approve"
            ? "Report approved and locked."
            : "Report returned to the IO with the review note.",
      );
      const history = await apiRequest(`/api/cases/${caseId}/final-report/versions`, { fresh: true });
      setVersions(history.versions || []);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Workflow action failed.");
    } finally {
      setWorking(false);
    }
  };

  const downloadPdf = async () => {
    if (!caseId || !report) return;
    setWorking(true);
    setError("");
    try {
      const response = await apiFetchResponse(`/api/cases/${caseId}/final-report/pdf`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const disposition = response.headers.get("content-disposition") || "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `Final_Report_${caseId}_v${report.versionNumber}.pdf`;
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "PDF export failed.");
    } finally {
      setWorking(false);
    }
  };

  const selectedAccused = useMemo(() => payload?.accused.filter((row) => row.selected) || [], [payload]);
  const selectedOffences = useMemo(() => payload?.offences.filter((row) => row.selected) || [], [payload]);
  const selectedWitnesses = useMemo(() => payload?.witnesses.filter((row) => row.selected) || [], [payload]);
  const selectedEvidence = useMemo(() => payload?.evidence.filter((row) => row.selected) || [], [payload]);

  const visibleOffences = useMemo(() => {
    if (!payload) return [];
    const search = offenceSearch.trim().toLowerCase();
    const rows = [...payload.offences].sort((a, b) => Number(b.selected) - Number(a.selected) || Number(b.suggested) - Number(a.suggested));
    if (!search) return rows;
    return rows.filter((row) => `${row.actCode} ${row.sectionNumber} ${row.title}`.toLowerCase().includes(search));
  }, [offenceSearch, payload]);

  const addManualAccused = () => {
    mutate((next) => {
      next.accused.push({
        key: localKey("manual-accused"),
        sourceCasePersonId: null,
        sourcePersonId: null,
        selected: true,
        name: "",
        phone: "",
        address: "",
        custodyStatus: "NOT_RECORDED",
        bailStatus: "NOT_RECORDED",
        allegation: "",
        disposition: "CHARGE_SHEETED",
        dispositionReason: "",
        alias: "",
        parentName: "",
        birthYear: "",
        gender: "",
        nationality: "",
        occupation: "",
        permanentAddress: "",
        identityStatus: "NOT_RECORDED",
        identityType: "",
        identityReference: "",
        arrestAt: "",
        bailAt: "",
        forwardedToCourtAt: "",
        regularCriminalNumber: "",
        previousConvictions: "",
        suretyDetails: "",
        isManual: true,
      });
    });
  };

  const addManualWitness = () => {
    mutate((next) => {
      next.witnesses.push({
        key: localKey("manual-witness"),
        sourceCasePersonId: null,
        sourcePersonId: null,
        selected: true,
        name: "",
        phone: "",
        address: "",
        statementSummary: "",
        evidenceType: "ORAL",
        relationshipName: "",
        birthYear: "",
        occupation: "",
        isManual: true,
      });
    });
  };

  const addManualOffence = () => {
    mutate((next) => {
      next.offences.unshift({
        key: localKey("manual-offence"),
        catalogId: null,
        selected: true,
        suggested: false,
        actCode: "BNS",
        sectionNumber: "",
        title: "",
        punishment: "",
        conditionNote: "",
        firStage: "NOT_RECORDED",
        finalDecision: "ADDED",
        decisionReason: "",
        approvalReference: "",
        isManual: true,
      });
    });
  };

  const addPropertyItem = () => {
    mutate((next) => {
      next.propertyItems = next.propertyItems || [];
      next.propertyItems.push({
        key: localKey("property"),
        selected: true,
        sourceEvidenceId: null,
        category: "OTHER",
        description: "",
        quantity: "",
        estimatedValue: "",
        recoveryStatus: "NOT_RECORDED",
        recoveredAt: "",
        seizureMemoReference: "",
        disposalStatus: "NOT_RECORDED",
      });
    });
  };

  const addExpertResult = () => {
    mutate((next) => {
      next.expertResults = next.expertResults || [];
      next.expertResults.push({
        key: localKey("expert-result"),
        sourceDocumentId: null,
        type: "OTHER",
        status: "NOT_RECORDED",
        referenceNumber: "",
        resultDate: "",
        summary: "",
      });
    });
  };

  const addMatrixLink = () => {
    if (!matrixAccusedKey || !matrixOffenceKey) {
      setError("Choose both an accused and an alleged section before adding a facts link.");
      return;
    }
    if (payload?.allegationMatrix.some((row) => row.accusedKey === matrixAccusedKey && row.offenceKey === matrixOffenceKey)) {
      setError("That accused-to-section link already exists.");
      return;
    }
    mutate((next) => {
      next.allegationMatrix.push({
        key: `${matrixAccusedKey}:${matrixOffenceKey}`,
        accusedKey: matrixAccusedKey,
        offenceKey: matrixOffenceKey,
        facts: "",
        evidenceKeys: [],
        witnessKeys: [],
      });
    });
    setError("");
  };

  const content = (() => {
    if (!payload || !report) return null;
    const caseDetails = payload.caseDetails;
    const phase2 = payload.schemaVersion >= 2;
    const metadata = payload.reportMetadata;
    const complainant = payload.complainant;

    if (stepIndex === 0) {
      return (
        <div>
          <SectionHeading
            title={phase2 ? "Filing details and case snapshot" : "Case snapshot"}
            description="Filing fields belong to this report version. The case snapshot remains read-only and is reloaded from the jurisdiction-scoped record whenever the draft is saved."
          />
          {phase2 && metadata && (
            <div className="mb-6 rounded-xl border border-hairline bg-surface p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-semibold text-foreground">Final-report filing details</h4>
                <Badge tone="amber">Rajasthan IIF-IV reference profile</Badge>
              </div>
              <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                This profile is based on the supplied Rajasthan specimens and is not presented as a notified Karnataka filing form.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div><FieldLabel>Final report / charge-sheet number *</FieldLabel><TextInput value={metadata.finalReportNumber} disabled={!editable} onChange={(event) => mutate((next) => { if (next.reportMetadata) next.reportMetadata.finalReportNumber = event.target.value; })} /></div>
                <div><FieldLabel>Final report date *</FieldLabel><TextInput type="date" value={metadata.finalReportDate} disabled={!editable} onChange={(event) => mutate((next) => { if (next.reportMetadata) next.reportMetadata.finalReportDate = event.target.value; })} /></div>
                <div><FieldLabel>Receiving Court *</FieldLabel><TextInput value={metadata.courtName} disabled={!editable} onChange={(event) => mutate((next) => { if (next.reportMetadata) next.reportMetadata.courtName = event.target.value; })} placeholder="Court name and place" /></div>
                <div><FieldLabel>Filing place</FieldLabel><TextInput value={metadata.filingPlace} disabled={!editable} onChange={(event) => mutate((next) => { if (next.reportMetadata) next.reportMetadata.filingPlace = event.target.value; })} /></div>
                <div><FieldLabel>Report category</FieldLabel><SelectInput value={metadata.reportCategory} disabled={!editable} onChange={(event) => mutate((next) => { if (next.reportMetadata) next.reportMetadata.reportCategory = event.target.value; })}><option value="ORIGINAL">Original</option><option value="SUPPLEMENTARY">Supplementary</option></SelectInput></div>
                <div><FieldLabel>Legal regime</FieldLabel><SelectInput value={metadata.legalRegime} disabled={!editable} onChange={(event) => mutate((next) => { if (next.reportMetadata) next.reportMetadata.legalRegime = event.target.value; })}><option value="BNS_BNSS_2023">BNS / BNSS 2023</option><option value="IPC_CRPC_LEGACY">IPC / CrPC legacy</option></SelectInput></div>
              </div>
            </div>
          )}
          <h4 className="mb-3 font-semibold text-foreground">Source case record</h4>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ["FIR number", caseDetails.firNumber],
              ["Police station", caseDetails.stationName],
              ["District", caseDetails.districtName],
              ["Crime type", caseDetails.crimeType],
              ["Incident date", caseDetails.incidentDate],
              ["Reported date", caseDetails.reportedDate],
              ["Current IO", caseDetails.currentIoName],
              ["IO badge", caseDetails.currentIoBadgeId],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-hairline bg-surface-2 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{String(label)}</p>
                <p className="mt-1 text-sm font-medium text-foreground">{String(value || "Not recorded")}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-hairline bg-surface p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Case summary</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {String(caseDetails.summary || "No case summary is recorded.")}
            </p>
          </div>
          {phase2 && complainant && (
            <div className="mt-6 rounded-xl border border-hairline bg-surface p-4">
              <h4 className="font-semibold text-foreground">Complainant / informant</h4>
              <p className="mt-1 text-xs text-muted-foreground">Record the FIR informant explicitly; a victim is not automatically assumed to be the complainant.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div><FieldLabel>Name *</FieldLabel><TextInput value={complainant.name} disabled={!editable || !complainant.isManual} onChange={(event) => mutate((next) => { if (next.complainant) next.complainant.name = event.target.value; })} /></div>
                <div><FieldLabel>Verification</FieldLabel><SelectInput value={complainant.verificationStatus || "NOT_RECORDED"} disabled={!editable} onChange={(event) => mutate((next) => { if (next.complainant) next.complainant.verificationStatus = event.target.value; })}><option value="NOT_RECORDED">Not recorded</option><option value="VERIFIED">Verified</option><option value="PENDING">Pending</option></SelectInput></div>
                <div><FieldLabel>Phone</FieldLabel><TextInput value={complainant.phone || ""} disabled={!editable || !complainant.isManual} onChange={(event) => mutate((next) => { if (next.complainant) next.complainant.phone = event.target.value; })} /></div>
                <div><FieldLabel>Relationship to victim</FieldLabel><TextInput value={complainant.relationshipToVictim || ""} disabled={!editable} onChange={(event) => mutate((next) => { if (next.complainant) next.complainant.relationshipToVictim = event.target.value; })} /></div>
                <div className="md:col-span-2"><FieldLabel>Address</FieldLabel><TextArea rows={2} value={complainant.address || ""} disabled={!editable || !complainant.isManual} onChange={(event) => mutate((next) => { if (next.complainant) next.complainant.address = event.target.value; })} /></div>
              </div>
              <div className="mt-4 border-t border-hairline pt-4">
                <h5 className="text-sm font-semibold text-foreground">Victims linked to the case</h5>
                {(payload.victims || []).length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No victim record is linked to this case.</p> : (
                  <div className="mt-2 space-y-2">{(payload.victims || []).map((victim) => (
                    <div key={victim.key} className="grid gap-2 rounded-lg border border-hairline p-3 md:grid-cols-[auto_220px_1fr]">
                      <input type="checkbox" checked={victim.selected} disabled={!editable} onChange={(event) => mutate((next) => { const row = (next.victims || []).find((item) => item.key === victim.key); if (row) row.selected = event.target.checked; })} className="mt-2 accent-teal" />
                      <p className="pt-2 text-sm font-medium text-foreground">{victim.name || "Unnamed victim"}</p>
                      <TextInput value={victim.injuryOrLoss || ""} disabled={!editable || !victim.selected} onChange={(event) => mutate((next) => { const row = (next.victims || []).find((item) => item.key === victim.key); if (row) row.injuryOrLoss = event.target.value; })} placeholder="Injury, loss or relevance" />
                    </div>
                  ))}</div>
                )}
              </div>
            </div>
          )}
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-teal/30 bg-teal/5 p-4">
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-teal" />
            <div>
              <p className="text-sm font-semibold text-foreground">Local deterministic preparation</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                The builder uses database records, rule-based legal suggestions and officer input. It does not send report content to an external AI model.
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (stepIndex === 1) {
      return (
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SectionHeading
              title="Accused persons sent for trial"
              description="Select only the accused included in this report. Record the precise allegation and current custody or bail position for each selected person."
            />
            {editable && (
              <Button variant="outline" size="sm" onClick={addManualAccused}>
                <Plus className="mr-1 h-4 w-4" /> Manual accused
              </Button>
            )}
          </div>
          <div className="space-y-3">
            {payload.accused.length === 0 && (
              <div className="rounded-xl border border-dashed border-hairline p-8 text-center text-sm text-muted-foreground">
                No accused is linked to this case. Add a manual working entry or update the case-person register first.
              </div>
            )}
            {payload.accused.map((row) => (
              <div key={row.key} className={cn("rounded-xl border p-4", row.selected ? "border-teal/40 bg-teal/5" : "border-hairline bg-surface") }>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={row.selected}
                    disabled={!editable}
                    onChange={(event) => patchPerson("accused", row.key, { selected: event.target.checked, disposition: event.target.checked ? "CHARGE_SHEETED" : "NOT_SELECTED" })}
                    className="mt-1 h-4 w-4 accent-teal"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {row.isManual ? (
                        <TextInput
                          value={row.name}
                          disabled={!editable}
                          onChange={(event) => patchPerson("accused", row.key, { name: event.target.value })}
                          placeholder="Full name"
                          className="max-w-sm font-semibold"
                        />
                      ) : (
                        <p className="font-semibold text-foreground">{row.name}</p>
                      )}
                      <Badge tone={row.isManual ? "amber" : "teal"}>{row.isManual ? "Manual entry" : "Case record"}</Badge>
                      {row.isManual && editable && (
                        <button
                          type="button"
                          onClick={() => mutate((next) => { next.accused = next.accused.filter((item) => item.key !== row.key); })}
                          className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                          aria-label="Remove manual accused"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {phase2 && (
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div><FieldLabel>Final disposition</FieldLabel><SelectInput value={row.disposition || (row.selected ? "CHARGE_SHEETED" : "NOT_SELECTED")} disabled={!editable} onChange={(event) => patchPerson("accused", row.key, { disposition: event.target.value, selected: event.target.value === "CHARGE_SHEETED" })}><option value="CHARGE_SHEETED">Charge-sheeted / sent for trial</option><option value="NOT_CHARGE_SHEETED">Not charge-sheeted</option><option value="NOT_SELECTED">Decision not recorded</option></SelectInput></div>
                        {!row.selected && row.disposition === "NOT_CHARGE_SHEETED" && <div><FieldLabel>Reason for not charge-sheeting *</FieldLabel><TextInput value={row.dispositionReason || ""} disabled={!editable} onChange={(event) => patchPerson("accused", row.key, { dispositionReason: event.target.value })} /></div>}
                      </div>
                    )}
                    {row.selected && (
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        {row.isManual && (
                          <>
                            <div>
                              <FieldLabel>Phone</FieldLabel>
                              <TextInput value={row.phone || ""} disabled={!editable} onChange={(event) => patchPerson("accused", row.key, { phone: event.target.value })} />
                            </div>
                            <div>
                              <FieldLabel>Address</FieldLabel>
                              <TextInput value={row.address || ""} disabled={!editable} onChange={(event) => patchPerson("accused", row.key, { address: event.target.value })} />
                            </div>
                          </>
                        )}
                        {phase2 && (
                          <>
                            <div><FieldLabel>Alias</FieldLabel><TextInput value={row.alias || ""} disabled={!editable} onChange={(event) => patchPerson("accused", row.key, { alias: event.target.value })} /></div>
                            <div><FieldLabel>Parent / guardian name</FieldLabel><TextInput value={row.parentName || ""} disabled={!editable} onChange={(event) => patchPerson("accused", row.key, { parentName: event.target.value })} /></div>
                            <div><FieldLabel>Birth year</FieldLabel><TextInput inputMode="numeric" value={row.birthYear || ""} disabled={!editable} onChange={(event) => patchPerson("accused", row.key, { birthYear: event.target.value })} /></div>
                            <div><FieldLabel>Gender</FieldLabel><TextInput value={row.gender || ""} disabled={!editable} onChange={(event) => patchPerson("accused", row.key, { gender: event.target.value })} /></div>
                            <div><FieldLabel>Nationality</FieldLabel><TextInput value={row.nationality || ""} disabled={!editable} onChange={(event) => patchPerson("accused", row.key, { nationality: event.target.value })} /></div>
                            <div><FieldLabel>Occupation</FieldLabel><TextInput value={row.occupation || ""} disabled={!editable} onChange={(event) => patchPerson("accused", row.key, { occupation: event.target.value })} /></div>
                            <div className="md:col-span-2"><FieldLabel>Permanent address</FieldLabel><TextArea rows={2} value={row.permanentAddress || ""} disabled={!editable} onChange={(event) => patchPerson("accused", row.key, { permanentAddress: event.target.value })} /></div>
                            <div><FieldLabel>Identity verification</FieldLabel><SelectInput value={row.identityStatus || "NOT_RECORDED"} disabled={!editable} onChange={(event) => patchPerson("accused", row.key, { identityStatus: event.target.value })}><option value="NOT_RECORDED">Not recorded</option><option value="PENDING">Pending</option><option value="VERIFIED">Verified</option><option value="UNVERIFIED">Could not verify</option></SelectInput></div>
                            <div><FieldLabel>Identity document / reference</FieldLabel><TextInput value={[row.identityType, row.identityReference].filter(Boolean).join(": ")} disabled={!editable} onChange={(event) => patchPerson("accused", row.key, { identityReference: event.target.value })} placeholder="Document type and last/reference digits only" /></div>
                            <div><FieldLabel>Arrest date/time</FieldLabel><TextInput type="datetime-local" value={row.arrestAt || ""} disabled={!editable} onChange={(event) => patchPerson("accused", row.key, { arrestAt: event.target.value })} /></div>
                            <div><FieldLabel>Forwarded to Court</FieldLabel><TextInput type="datetime-local" value={row.forwardedToCourtAt || ""} disabled={!editable} onChange={(event) => patchPerson("accused", row.key, { forwardedToCourtAt: event.target.value })} /></div>
                            <div><FieldLabel>Bail date</FieldLabel><TextInput type="date" value={row.bailAt || ""} disabled={!editable} onChange={(event) => patchPerson("accused", row.key, { bailAt: event.target.value })} /></div>
                            <div><FieldLabel>Regular criminal number</FieldLabel><TextInput value={row.regularCriminalNumber || ""} disabled={!editable} onChange={(event) => patchPerson("accused", row.key, { regularCriminalNumber: event.target.value })} /></div>
                            <div><FieldLabel>Previous convictions</FieldLabel><TextArea rows={2} value={row.previousConvictions || ""} disabled={!editable} onChange={(event) => patchPerson("accused", row.key, { previousConvictions: event.target.value })} /></div>
                            <div><FieldLabel>Surety / bailer details</FieldLabel><TextArea rows={2} value={row.suretyDetails || ""} disabled={!editable} onChange={(event) => patchPerson("accused", row.key, { suretyDetails: event.target.value })} /></div>
                          </>
                        )}
                        <div>
                          <FieldLabel>Custody / remand status</FieldLabel>
                          <SelectInput value={row.custodyStatus || "NOT_RECORDED"} disabled={!editable} onChange={(event) => patchPerson("accused", row.key, { custodyStatus: event.target.value })}>
                            <option value="NOT_RECORDED">Not recorded</option>
                            <option value="REMANDED">Remanded</option>
                            <option value="JUDICIAL_CUSTODY">Judicial custody</option>
                            <option value="POLICE_CUSTODY">Police custody</option>
                            <option value="NOT_IN_CUSTODY">Not in custody</option>
                            <option value="ABSCONDING">Absconding</option>
                          </SelectInput>
                        </div>
                        <div>
                          <FieldLabel>Bail status</FieldLabel>
                          <SelectInput value={row.bailStatus || "NOT_RECORDED"} disabled={!editable} onChange={(event) => patchPerson("accused", row.key, { bailStatus: event.target.value })}>
                            <option value="NOT_RECORDED">Not recorded</option>
                            <option value="NOT_APPLIED">Not applied</option>
                            <option value="PENDING">Application pending</option>
                            <option value="GRANTED">Granted</option>
                            <option value="REJECTED">Rejected</option>
                          </SelectInput>
                        </div>
                        <div className="md:col-span-2">
                          <FieldLabel>Specific allegation against this accused *</FieldLabel>
                          <TextArea
                            rows={3}
                            value={row.allegation || ""}
                            disabled={!editable}
                            onChange={(event) => patchPerson("accused", row.key, { allegation: event.target.value })}
                            placeholder="State the acts attributed to this accused; do not copy a generic case summary."
                          />
                        </div>
                        {row.firstRemandAt && (
                          <p className="text-xs text-muted-foreground md:col-span-2">First remand in the case clock: {displayDate(row.firstRemandAt)}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (stepIndex === 2) {
      return (
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SectionHeading
              title="Alleged sections and supporting facts"
              description="Suggestions are rule-based starting points only. The IO must select the applicable provisions, verify conditions and link each section to an accused and recorded facts."
            />
            {editable && (
              <Button variant="outline" size="sm" onClick={addManualOffence}>
                <Plus className="mr-1 h-4 w-4" /> Manual legal entry
              </Button>
            )}
          </div>
          <TextInput
            value={offenceSearch}
            onChange={(event) => setOffenceSearch(event.target.value)}
            placeholder="Search the provisional BNS catalogue"
            className="mb-3"
          />
          <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-hairline bg-surface-2 p-3">
            {visibleOffences.map((row) => (
              <div key={row.key} className={cn("rounded-lg border bg-surface p-3", row.selected ? "border-teal/40" : "border-hairline") }>
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={row.selected} disabled={!editable} onChange={(event) => patchOffence(row.key, { selected: event.target.checked, finalDecision: event.target.checked ? (row.firStage === "ALLEGED" ? "RETAINED" : "ADDED") : "NOT_RECORDED" })} className="mt-1 h-4 w-4 accent-teal" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {row.isManual ? (
                        <div className="grid flex-1 gap-2 sm:grid-cols-[100px_120px_1fr]">
                          <TextInput value={row.actCode} disabled={!editable} onChange={(event) => patchOffence(row.key, { actCode: event.target.value })} placeholder="Act" />
                          <TextInput value={row.sectionNumber} disabled={!editable} onChange={(event) => patchOffence(row.key, { sectionNumber: event.target.value })} placeholder="Section" />
                          <TextInput value={row.title} disabled={!editable} onChange={(event) => patchOffence(row.key, { title: event.target.value })} placeholder="Offence title" />
                        </div>
                      ) : (
                        <p className="text-sm font-semibold text-foreground">{row.actCode} {row.sectionNumber} - {row.title}</p>
                      )}
                      {row.suggested && <Badge tone="amber">Suggested</Badge>}
                      {row.isManual && <Badge tone="danger">Verify statute</Badge>}
                      {row.isManual && editable && (
                        <button type="button" onClick={() => mutate((next) => { next.offences = next.offences.filter((item) => item.key !== row.key); })} className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger" aria-label="Remove manual legal entry">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {row.selected && (
                      <div className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {row.isManual ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <TextArea rows={2} value={row.punishment || ""} disabled={!editable} onChange={(event) => patchOffence(row.key, { punishment: event.target.value })} placeholder="Punishment provision" />
                            <TextArea rows={2} value={row.conditionNote || ""} disabled={!editable} onChange={(event) => patchOffence(row.key, { conditionNote: event.target.value })} placeholder="Conditions / legal verification note" />
                          </div>
                        ) : (
                          <>
                            <p>{row.punishment || "Punishment detail not recorded."}</p>
                            {row.conditionNote && <p className="mt-1 text-amber">Condition: {row.conditionNote}</p>}
                          </>
                        )}
                      </div>
                    )}
                    {phase2 && (row.selected || row.firStage === "ALLEGED" || row.finalDecision === "DROPPED") && (
                      <div className="mt-3 grid gap-2 rounded-lg border border-hairline bg-surface-2 p-3 sm:grid-cols-2">
                        <div><FieldLabel>At FIR stage</FieldLabel><SelectInput value={row.firStage || "NOT_RECORDED"} disabled={!editable} onChange={(event) => patchOffence(row.key, { firStage: event.target.value })}><option value="NOT_RECORDED">Not recorded in builder</option><option value="ALLEGED">Included in FIR</option><option value="NOT_ALLEGED">Not included in FIR</option></SelectInput></div>
                        <div><FieldLabel>Investigation decision *</FieldLabel><SelectInput value={row.finalDecision || "NOT_RECORDED"} disabled={!editable} onChange={(event) => patchOffence(row.key, { finalDecision: event.target.value, selected: ["RETAINED", "ADDED"].includes(event.target.value) })}><option value="NOT_RECORDED">Decision not recorded</option><option value="RETAINED">Retained from FIR</option><option value="ADDED">Added after investigation</option><option value="DROPPED">Dropped after investigation</option></SelectInput></div>
                        {(row.finalDecision === "DROPPED" || row.finalDecision === "ADDED") && <div><FieldLabel>Reason for change</FieldLabel><TextArea rows={2} value={row.decisionReason || ""} disabled={!editable} onChange={(event) => patchOffence(row.key, { decisionReason: event.target.value })} /></div>}
                        {row.finalDecision === "DROPPED" && <div><FieldLabel>Approval / supervision reference</FieldLabel><TextArea rows={2} value={row.approvalReference || ""} disabled={!editable} onChange={(event) => patchOffence(row.key, { approvalReference: event.target.value })} /></div>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-hairline pt-6">
            <h4 className="font-semibold text-foreground">Accused-to-section facts matrix</h4>
            <p className="mt-1 text-sm text-muted-foreground">Every selected accused and every selected section must appear in at least one completed link.</p>
            {editable && (
              <div className="mt-3 grid gap-2 rounded-xl border border-hairline bg-surface-2 p-3 md:grid-cols-[1fr_1fr_auto]">
                <SelectInput value={matrixAccusedKey} onChange={(event) => setMatrixAccusedKey(event.target.value)}>
                  <option value="">Choose accused</option>
                  {selectedAccused.map((row) => <option key={row.key} value={row.key}>{row.name || "Unnamed accused"}</option>)}
                </SelectInput>
                <SelectInput value={matrixOffenceKey} onChange={(event) => setMatrixOffenceKey(event.target.value)}>
                  <option value="">Choose section</option>
                  {selectedOffences.map((row) => <option key={row.key} value={row.key}>{row.actCode} {row.sectionNumber} - {row.title}</option>)}
                </SelectInput>
                <Button variant="outline" onClick={addMatrixLink}><Plus className="mr-1 h-4 w-4" /> Add link</Button>
              </div>
            )}
            <div className="mt-3 space-y-3">
              {payload.allegationMatrix.length === 0 && (
                <div className="rounded-xl border border-dashed border-hairline p-6 text-center text-sm text-muted-foreground">No accused-to-section facts links have been added.</div>
              )}
              {payload.allegationMatrix.map((row) => {
                const accusedRow = payload.accused.find((item) => item.key === row.accusedKey);
                const offenceRow = payload.offences.find((item) => item.key === row.offenceKey);
                if (!accusedRow || !offenceRow) return null;
                return (
                  <div key={row.key} className="rounded-xl border border-hairline bg-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{accusedRow.name || "Unnamed accused"} <span className="text-muted-foreground">under</span> {offenceRow.actCode} {offenceRow.sectionNumber}</p>
                        <p className="text-xs text-muted-foreground">{offenceRow.title}</p>
                      </div>
                      {editable && (
                        <button type="button" onClick={() => mutate((next) => { next.allegationMatrix = next.allegationMatrix.filter((item) => item.key !== row.key); })} className="rounded-md p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger" aria-label="Remove allegation link">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="mt-3">
                      <FieldLabel>Supporting facts *</FieldLabel>
                      <TextArea rows={3} value={row.facts} disabled={!editable} onChange={(event) => mutate((next) => { const item = next.allegationMatrix.find((candidate) => candidate.key === row.key); if (item) item.facts = event.target.value; })} placeholder="State the verified facts supporting this legal ingredient." />
                    </div>
                    {(selectedEvidence.length > 0 || selectedWitnesses.length > 0) && (
                      <div className="mt-3 grid gap-4 md:grid-cols-2">
                        <div>
                          <FieldLabel>Linked evidence</FieldLabel>
                          <div className="space-y-1.5 rounded-lg border border-hairline p-2">
                            {selectedEvidence.length === 0 ? <p className="text-xs text-muted-foreground">Select evidence in the Sources step first.</p> : selectedEvidence.map((item) => (
                              <label key={item.key} className="flex items-start gap-2 text-xs text-foreground">
                                <input type="checkbox" disabled={!editable} checked={row.evidenceKeys.includes(item.key)} onChange={(event) => mutate((next) => { const matrixItem = next.allegationMatrix.find((candidate) => candidate.key === row.key); if (!matrixItem) return; matrixItem.evidenceKeys = event.target.checked ? [...matrixItem.evidenceKeys, item.key] : matrixItem.evidenceKeys.filter((key) => key !== item.key); })} className="mt-0.5 accent-teal" />
                                <span>{item.description}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div>
                          <FieldLabel>Linked witnesses</FieldLabel>
                          <div className="space-y-1.5 rounded-lg border border-hairline p-2">
                            {selectedWitnesses.length === 0 ? <p className="text-xs text-muted-foreground">Select witnesses in the Sources step first.</p> : selectedWitnesses.map((item) => (
                              <label key={item.key} className="flex items-start gap-2 text-xs text-foreground">
                                <input type="checkbox" disabled={!editable} checked={row.witnessKeys.includes(item.key)} onChange={(event) => mutate((next) => { const matrixItem = next.allegationMatrix.find((candidate) => candidate.key === row.key); if (!matrixItem) return; matrixItem.witnessKeys = event.target.checked ? [...matrixItem.witnessKeys, item.key] : matrixItem.witnessKeys.filter((key) => key !== item.key); })} className="mt-0.5 accent-teal" />
                                <span>{item.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    if (stepIndex === 3) {
      return (
        <div>
          <SectionHeading
            title="Witness, evidence and document schedules"
            description="Select the case records relied upon in the report. The server will reject source IDs that do not belong to this case."
          />
          <div className="space-y-6">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="font-semibold text-foreground">Prosecution witnesses</h4>
                {editable && <Button variant="outline" size="sm" onClick={addManualWitness}><Plus className="mr-1 h-4 w-4" /> Manual witness</Button>}
              </div>
              <div className="space-y-2">
                {payload.witnesses.length === 0 && <p className="rounded-lg border border-dashed border-hairline p-4 text-sm text-muted-foreground">No witness is linked to the case.</p>}
                {payload.witnesses.map((row) => (
                  <div key={row.key} className={cn("rounded-lg border p-3", row.selected ? "border-teal/40 bg-teal/5" : "border-hairline bg-surface") }>
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={row.selected} disabled={!editable} onChange={(event) => patchPerson("witnesses", row.key, { selected: event.target.checked })} className="mt-1 accent-teal" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {row.isManual ? <TextInput value={row.name} disabled={!editable} onChange={(event) => patchPerson("witnesses", row.key, { name: event.target.value })} placeholder="Witness name" className="max-w-sm font-semibold" /> : <p className="text-sm font-semibold text-foreground">{row.name}</p>}
                          <Badge tone={row.isManual ? "amber" : "teal"}>{row.isManual ? "Manual" : "Case record"}</Badge>
                          {row.isManual && editable && <button type="button" onClick={() => mutate((next) => { next.witnesses = next.witnesses.filter((item) => item.key !== row.key); })} className="ml-auto rounded-md p-1.5 text-muted-foreground hover:text-danger"><Trash2 className="h-4 w-4" /></button>}
                        </div>
                        {row.selected && (
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            {row.isManual && <TextInput value={row.address || ""} disabled={!editable} onChange={(event) => patchPerson("witnesses", row.key, { address: event.target.value })} placeholder="Address" />}
                            {row.isManual && <TextInput value={row.phone || ""} disabled={!editable} onChange={(event) => patchPerson("witnesses", row.key, { phone: event.target.value })} placeholder="Phone" />}
                            {phase2 && <SelectInput value={row.evidenceType || "ORAL"} disabled={!editable} onChange={(event) => patchPerson("witnesses", row.key, { evidenceType: event.target.value })}><option value="ORAL">Oral / fact witness</option><option value="FORMAL">Formal witness</option><option value="EXPERT">Expert witness</option><option value="INVESTIGATING_OFFICER">Investigating officer</option></SelectInput>}
                            {phase2 && <TextInput value={row.relationshipName || ""} disabled={!editable} onChange={(event) => patchPerson("witnesses", row.key, { relationshipName: event.target.value })} placeholder="Parent / spouse name" />}
                            {phase2 && <TextInput value={row.birthYear || ""} disabled={!editable} onChange={(event) => patchPerson("witnesses", row.key, { birthYear: event.target.value })} placeholder="Birth year" />}
                            {phase2 && <TextInput value={row.occupation || ""} disabled={!editable} onChange={(event) => patchPerson("witnesses", row.key, { occupation: event.target.value })} placeholder="Occupation" />}
                            <TextArea rows={2} value={row.statementSummary || ""} disabled={!editable} onChange={(event) => patchPerson("witnesses", row.key, { statementSummary: event.target.value })} placeholder="Statement / relevance summary" className="md:col-span-2" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h4 className="mb-2 font-semibold text-foreground">Evidence register</h4>
              <div className="space-y-2">
                {payload.evidence.length === 0 && <p className="rounded-lg border border-dashed border-hairline p-4 text-sm text-muted-foreground">No evidence record is linked to the case.</p>}
                {payload.evidence.map((row) => (
                  <div key={row.key} className={cn("rounded-lg border p-3", row.selected ? "border-teal/40 bg-teal/5" : "border-hairline bg-surface") }>
                    <div className="flex items-start gap-3">
                    <input type="checkbox" checked={row.selected} disabled={!editable} onChange={(event) => mutate((next) => { const item = next.evidence.find((candidate) => candidate.key === row.key); if (item) item.selected = event.target.checked; })} className="mt-1 accent-teal" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">{row.type} - {row.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{row.status || "Status not recorded"} | {displayDate(row.timestamp)}</p>
                    </div>
                    </div>
                    {phase2 && row.selected && <div className="mt-3 grid gap-2 border-t border-hairline pt-3 md:grid-cols-2"><SelectInput value={row.resultStatus || "NOT_RECORDED"} disabled={!editable} onChange={(event) => mutate((next) => { const item = next.evidence.find((candidate) => candidate.key === row.key); if (item) item.resultStatus = event.target.value; })}><option value="NOT_RECORDED">Result not recorded</option><option value="PENDING">Pending</option><option value="RECEIVED">Received</option><option value="NOT_APPLICABLE">Not applicable</option></SelectInput><TextInput value={row.referenceNumber || ""} disabled={!editable} onChange={(event) => mutate((next) => { const item = next.evidence.find((candidate) => candidate.key === row.key); if (item) item.referenceNumber = event.target.value; })} placeholder="Lab / medical / evidence reference" /><TextArea rows={2} value={row.resultSummary || ""} disabled={!editable} onChange={(event) => mutate((next) => { const item = next.evidence.find((candidate) => candidate.key === row.key); if (item) item.resultSummary = event.target.value; })} placeholder="Verified result summary" className="md:col-span-2" /></div>}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h4 className="mb-2 font-semibold text-foreground">Document / annexure index</h4>
              <div className="space-y-2">
                {payload.documents.length === 0 && <p className="rounded-lg border border-dashed border-hairline p-4 text-sm text-muted-foreground">No uploaded document is linked to the case.</p>}
                {payload.documents.map((row) => (
                  <div key={row.key} className={cn("grid items-center gap-3 rounded-lg border p-3 md:grid-cols-[auto_1fr_220px]", row.selected ? "border-teal/40 bg-teal/5" : "border-hairline bg-surface") }>
                    <input type="checkbox" checked={row.selected} disabled={!editable} onChange={(event) => mutate((next) => { const item = next.documents.find((candidate) => candidate.key === row.key); if (item) item.selected = event.target.checked; })} className="accent-teal" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">{row.name}</p>
                      <p className="text-xs text-muted-foreground">{displayDate(row.createdAt)}</p>
                    </div>
                    <SelectInput value={row.category || "OTHER"} disabled={!editable || !row.selected} onChange={(event) => mutate((next) => { const item = next.documents.find((candidate) => candidate.key === row.key); if (item) item.category = event.target.value; })}>
                      {documentCategories.map((category) => <option key={category} value={category}>{category.replace(/_/g, " ")}</option>)}
                    </SelectInput>
                    {phase2 && row.selected && <div className="grid gap-2 border-t border-hairline pt-3 md:col-span-3 md:grid-cols-4"><TextInput type="number" min={1} value={row.sequenceNumber || 1} disabled={!editable} onChange={(event) => mutate((next) => { const item = next.documents.find((candidate) => candidate.key === row.key); if (item) item.sequenceNumber = Number(event.target.value); })} placeholder="Serial order" /><TextInput value={row.annexureNumber || ""} disabled={!editable} onChange={(event) => mutate((next) => { const item = next.documents.find((candidate) => candidate.key === row.key); if (item) item.annexureNumber = event.target.value; })} placeholder="Annexure no." /><TextInput type="number" min={1} value={row.pageCount || 1} disabled={!editable} onChange={(event) => mutate((next) => { const item = next.documents.find((candidate) => candidate.key === row.key); if (item) item.pageCount = Number(event.target.value); })} placeholder="Pages" /><SelectInput value={row.copyType || "COPY_STATUS_NOT_RECORDED"} disabled={!editable} onChange={(event) => mutate((next) => { const item = next.documents.find((candidate) => candidate.key === row.key); if (item) item.copyType = event.target.value; })}><option value="COPY_STATUS_NOT_RECORDED">Copy status not recorded</option><option value="ORIGINAL">Original</option><option value="CERTIFIED_COPY">Certified copy</option><option value="COPY">Copy</option></SelectInput><TextInput value={row.description || ""} disabled={!editable} onChange={(event) => mutate((next) => { const item = next.documents.find((candidate) => candidate.key === row.key); if (item) item.description = event.target.value; })} placeholder="Annexure description" className="md:col-span-4" /></div>}
                  </div>
                ))}
              </div>
            </section>

            {phase2 && <section>
              <div className="mb-2 flex items-center justify-between"><h4 className="font-semibold text-foreground">Seized / recovered property</h4>{editable && <Button variant="outline" size="sm" onClick={addPropertyItem}><Plus className="mr-1 h-4 w-4" /> Add property</Button>}</div>
              <div className="space-y-2">{(payload.propertyItems || []).length === 0 && <p className="rounded-lg border border-dashed border-hairline p-4 text-sm text-muted-foreground">No property item recorded. Validation will require an explanation if none applies.</p>}{(payload.propertyItems || []).map((row) => <div key={row.key} className="rounded-lg border border-hairline bg-surface p-3"><div className="flex justify-end">{editable && <button type="button" onClick={() => mutate((next) => { next.propertyItems = (next.propertyItems || []).filter((item) => item.key !== row.key); })} className="text-muted-foreground hover:text-danger"><Trash2 className="h-4 w-4" /></button>}</div><div className="grid gap-2 md:grid-cols-3"><TextInput value={row.description} disabled={!editable} onChange={(event) => mutate((next) => { const item = (next.propertyItems || []).find((candidate) => candidate.key === row.key); if (item) item.description = event.target.value; })} placeholder="Property description" className="md:col-span-2" /><TextInput value={row.quantity || ""} disabled={!editable} onChange={(event) => mutate((next) => { const item = (next.propertyItems || []).find((candidate) => candidate.key === row.key); if (item) item.quantity = event.target.value; })} placeholder="Quantity" /><SelectInput value={row.recoveryStatus || "NOT_RECORDED"} disabled={!editable} onChange={(event) => mutate((next) => { const item = (next.propertyItems || []).find((candidate) => candidate.key === row.key); if (item) item.recoveryStatus = event.target.value; })}><option value="NOT_RECORDED">Recovery not recorded</option><option value="RECOVERED">Recovered</option><option value="SEIZED">Seized</option><option value="NOT_RECOVERED">Not recovered</option></SelectInput><TextInput value={row.seizureMemoReference || ""} disabled={!editable} onChange={(event) => mutate((next) => { const item = (next.propertyItems || []).find((candidate) => candidate.key === row.key); if (item) item.seizureMemoReference = event.target.value; })} placeholder="Seizure memo reference" /><TextInput value={row.disposalStatus || "NOT_RECORDED"} disabled={!editable} onChange={(event) => mutate((next) => { const item = (next.propertyItems || []).find((candidate) => candidate.key === row.key); if (item) item.disposalStatus = event.target.value; })} placeholder="Disposal / custody status" /></div></div>)}</div>
            </section>}

            {phase2 && <section>
              <div className="mb-2 flex items-center justify-between"><h4 className="font-semibold text-foreground">Medical, forensic and electronic results</h4>{editable && <Button variant="outline" size="sm" onClick={addExpertResult}><Plus className="mr-1 h-4 w-4" /> Add result</Button>}</div>
              <div className="space-y-2">{(payload.expertResults || []).map((row) => <div key={row.key} className="rounded-lg border border-hairline bg-surface p-3"><div className="grid gap-2 md:grid-cols-3"><SelectInput value={row.type} disabled={!editable} onChange={(event) => mutate((next) => { const item = (next.expertResults || []).find((candidate) => candidate.key === row.key); if (item) item.type = event.target.value; })}><option value="MEDICAL">Medical</option><option value="FORENSIC">Forensic / FSL</option><option value="ELECTRONIC">Electronic evidence</option><option value="CCTV">CCTV</option><option value="OTHER">Other</option></SelectInput><SelectInput value={row.status} disabled={!editable} onChange={(event) => mutate((next) => { const item = (next.expertResults || []).find((candidate) => candidate.key === row.key); if (item) item.status = event.target.value; })}><option value="NOT_RECORDED">Not recorded</option><option value="PENDING">Pending</option><option value="RECEIVED">Received</option><option value="NOT_APPLICABLE">Not applicable</option></SelectInput><TextInput value={row.referenceNumber || ""} disabled={!editable} onChange={(event) => mutate((next) => { const item = (next.expertResults || []).find((candidate) => candidate.key === row.key); if (item) item.referenceNumber = event.target.value; })} placeholder="Reference number" /><TextArea rows={2} value={row.summary || ""} disabled={!editable} onChange={(event) => mutate((next) => { const item = (next.expertResults || []).find((candidate) => candidate.key === row.key); if (item) item.summary = event.target.value; })} placeholder="Verified result / reason pending" className="md:col-span-2" /><Button variant="ghost" disabled={!editable} onClick={() => mutate((next) => { next.expertResults = (next.expertResults || []).filter((item) => item.key !== row.key); })} className="text-danger"><Trash2 className="mr-1 h-4 w-4" /> Remove</Button></div></div>)}{(payload.expertResults || []).length === 0 && <p className="rounded-lg border border-dashed border-hairline p-4 text-sm text-muted-foreground">No expert result recorded.</p>}</div>
            </section>}
          </div>
        </div>
      );
    }

    if (stepIndex === 4) {
      return (
        <div>
          <SectionHeading
            title="Officer-authored investigation narrative"
            description="The initial background and investigation log come from recorded case data. Edit for accuracy and completeness; do not add facts that are absent from the case record."
          />
          <div className="space-y-5">
            {narrativeFields.map(([key, label, help]) => (
              <div key={key}>
                <FieldLabel>{label}{["caseBackground", "investigationConducted", "conclusion", "prayer"].includes(key) ? " *" : ""}</FieldLabel>
                <p className="mb-2 text-xs text-muted-foreground">{help}</p>
                <TextArea rows={key === "investigationConducted" ? 8 : 5} value={payload.narrative[key] || ""} disabled={!editable} onChange={(event) => mutate((next) => { next.narrative[key] = event.target.value; })} />
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div>
        <SectionHeading
          title="Validation, declaration and supervisory workflow"
          description="Save first to run the authoritative server checks. A report cannot be submitted while blocking errors or unanswered explanation items remain."
        />
        {dirty && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber/40 bg-amber/10 p-4 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber" />
            Save your current changes to refresh the validation result before submission.
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-hairline bg-surface-2 p-4">
            <p className="text-2xl font-bold text-danger">{validation.counts.errors}</p>
            <p className="text-xs text-muted-foreground">Blocking errors</p>
          </div>
          <div className="rounded-xl border border-hairline bg-surface-2 p-4">
            <p className="text-2xl font-bold text-amber">{validation.counts.unansweredExplanations}</p>
            <p className="text-xs text-muted-foreground">Explanations required</p>
          </div>
          <div className="rounded-xl border border-hairline bg-surface-2 p-4">
            <p className={cn("text-2xl font-bold", validation.ready ? "text-teal" : "text-muted-foreground")}>{validation.ready ? "Ready" : "Not ready"}</p>
            <p className="text-xs text-muted-foreground">Submission check</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {validation.issues.length === 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-teal/40 bg-teal/5 p-4">
              <CheckCircle2 className="h-5 w-5 text-teal" />
              <p className="text-sm font-medium text-foreground">No validation issues in the saved version.</p>
            </div>
          )}
          {validation.issues.map((issue) => (
            <div key={issue.key} className={cn("rounded-xl border p-4", issue.severity === "ERROR" ? "border-danger/30 bg-danger/5" : "border-amber/40 bg-amber/5") }>
              <div className="flex items-start gap-3">
                {issue.severity === "ERROR" ? <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" /> : <FileText className="mt-0.5 h-5 w-5 shrink-0 text-amber" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{issue.message}</p>
                    <Badge tone={issue.severity === "ERROR" ? "danger" : "amber"}>{issue.severity === "ERROR" ? "REQUIRED" : "NOTE REQUIRED"}</Badge>
                  </div>
                  {issue.severity === "EXPLANATION" && (
                    <TextArea
                      rows={2}
                      className="mt-3"
                      value={payload.issueExplanations[issue.key] || ""}
                      disabled={!editable}
                      onChange={(event) => mutate((next) => { next.issueExplanations[issue.key] = event.target.value; })}
                      placeholder="Officer explanation required before submission"
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <label className={cn("mt-5 flex items-start gap-3 rounded-xl border p-4", payload.officerDeclaration ? "border-teal/40 bg-teal/5" : "border-hairline bg-surface") }>
          <input type="checkbox" checked={payload.officerDeclaration} disabled={!editable} onChange={(event) => mutate((next) => { next.officerDeclaration = event.target.checked; })} className="mt-1 h-4 w-4 accent-teal" />
          <span className="text-sm leading-relaxed text-foreground">
            I confirm that I have verified the selected accused, alleged legal provisions, facts and filing schedules against the case record, and that the narrative does not introduce unrecorded facts.
          </span>
        </label>

        <div className="mt-6 rounded-xl border border-hairline bg-surface-2 p-4">
          <h4 className="font-semibold text-foreground">Workflow actions</h4>
          <p className="mt-1 text-xs text-muted-foreground">Submission locks editing. Approval must be performed by a permitted officer other than the report creator.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {editable && (
              <Button disabled={working || dirty || !validation.ready} onClick={() => void transition("submit-review")} className="bg-ink text-white hover:bg-ink/90">
                <Send className="mr-1 h-4 w-4" /> Submit for review
              </Button>
            )}
            {report.status === "READY_FOR_REVIEW" && (
              <Button disabled={working} onClick={() => void transition("approve")} className="bg-teal text-white hover:bg-teal/90">
                <Check className="mr-1 h-4 w-4" /> Approve and lock
              </Button>
            )}
          </div>
          {report.status === "READY_FOR_REVIEW" && (
            <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]">
              <TextArea rows={2} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Required correction note" />
              <Button variant="outline" disabled={working || reviewNote.trim().length < 2} onClick={() => void transition("return")} className="self-end border-danger/40 text-danger hover:bg-danger/5">Return for correction</Button>
            </div>
          )}
          {report.reviewNote && (
            <div className="mt-4 rounded-lg border border-amber/30 bg-amber/10 p-3">
              <p className="text-xs font-semibold uppercase text-amber">Latest review note</p>
              <p className="mt-1 text-sm text-foreground">{report.reviewNote}</p>
            </div>
          )}
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-semibold text-foreground">Immutable version history</h4>
          </div>
          <div className="overflow-hidden rounded-xl border border-hairline">
            {versions.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No versions recorded.</p>
            ) : versions.map((version, index) => (
              <div key={version.id} className={cn("grid gap-2 px-4 py-3 text-sm md:grid-cols-[90px_1fr_180px]", index > 0 && "border-t border-hairline") }>
                <p className="font-semibold text-foreground">Version {version.versionNumber}</p>
                <div>
                  <p className="text-foreground">{version.event.replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted-foreground">{version.createdByName}{version.createdByBadgeId ? ` (${version.createdByBadgeId})` : ""}</p>
                </div>
                <p className="text-xs text-muted-foreground md:text-right">{displayDate(version.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  })();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[94vh] w-[96vw] max-w-[1500px] flex-col gap-0 overflow-hidden bg-background p-0">
        <DialogHeader className="shrink-0 border-b border-hairline bg-surface px-5 py-4 pr-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <FileText className="h-5 w-5 text-teal" />
                Structured Final Report Builder
              </DialogTitle>
              <p className="mt-1 text-xs text-muted-foreground">BNSS section 193 provisional working format | human verification required</p>
            </div>
            {report && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(report.status)}>{statusLabel(report.status)}</Badge>
                <Badge tone="neutral">Version {report.versionNumber}</Badge>
                {editable && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={working || dirty}
                    title={dirty ? "Save or discard report edits before refreshing case data" : "Fill missing fields from verified case report data"}
                    onClick={() => void refreshCaseData()}
                  >
                    <RefreshCw className="mr-1 h-4 w-4" /> Refresh case data
                  </Button>
                )}
                <Button variant="outline" size="sm" disabled={working} onClick={() => void downloadPdf()}>
                  <Download className="mr-1 h-4 w-4" /> PDF
                </Button>
                {editable && (
                  <Button size="sm" disabled={working || !dirty} onClick={() => void save()} className="bg-ink text-white hover:bg-ink/90">
                    {working ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                    Save version
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-teal" />
              <p className="mt-3 text-sm text-muted-foreground">Loading the structured report...</p>
            </div>
          ) : error && !result ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <ShieldAlert className="h-10 w-10 text-danger" />
              <h3 className="mt-3 text-lg font-semibold text-foreground">Final report could not be loaded</h3>
              <p className="mt-2 max-w-lg text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" className="mt-4" onClick={() => void load()}><RefreshCw className="mr-1 h-4 w-4" /> Retry</Button>
            </div>
          ) : result && !result.storageReady ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <FileClock className="h-12 w-12 text-amber" />
              <h3 className="mt-4 text-xl font-semibold text-foreground">Test database migration required</h3>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                The builder code is available, but its isolated Phase 1 tables have not been added to this database. Apply migration 0010 to the test database only; the original round-one database must remain unchanged.
              </p>
            </div>
          ) : result && !report ? (
            <div className="flex h-full flex-col items-center justify-center bg-surface-2 p-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-teal/30 bg-teal/10">
                <ClipboardCheck className="h-8 w-8 text-teal" />
              </div>
              <h3 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">Create the structured working draft</h3>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                This initializes selectable accused, legal-section suggestions, witnesses, evidence, documents and narrative fields from the existing case. It does not call an AI service and does not change the underlying case records.
              </p>
              <div className="mt-4 rounded-lg border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-foreground">
                Provisional format until the Karnataka charge-sheet specimen is supplied and mapped.
              </div>
              <Button disabled={working} onClick={() => void initialize()} className="mt-5 bg-ink text-white hover:bg-ink/90">
                {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Initialize structured draft
              </Button>
            </div>
          ) : report && payload ? (
            <div className="flex h-full min-h-0 flex-col md:flex-row">
              <aside className="shrink-0 border-b border-hairline bg-surface-2 p-3 md:w-56 md:border-b-0 md:border-r">
                <nav className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible" aria-label="Final report steps">
                  {steps.map((step, index) => {
                    const Icon = step.icon;
                    return (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => setStepIndex(index)}
                        className={cn(
                          "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition",
                          stepIndex === index ? "bg-ink font-semibold text-white shadow-sm" : "text-muted-foreground hover:bg-surface hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{index + 1}. {step.label}</span>
                      </button>
                    );
                  })}
                </nav>
                <div className="mt-4 hidden rounded-xl border border-hairline bg-surface p-3 md:block">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Saved validation</p>
                  <div className="mt-2 flex items-center gap-2">
                    {validation.ready ? <CheckCircle2 className="h-4 w-4 text-teal" /> : <FileText className="h-4 w-4 text-amber" />}
                    <span className="text-xs font-medium text-foreground">{validation.ready ? "Ready for review" : `${validation.counts.errors} pending items`}</span>
                  </div>
                  {dirty && <p className="mt-2 text-[11px] text-amber">Unsaved changes</p>}
                </div>
              </aside>
              <main className="min-w-0 flex-1 overflow-y-auto">
                {(error || success) && (
                  <div className="sticky top-0 z-10 px-5 pt-4">
                    {error && <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span className="break-all">{error}</span></div>}
                    {success && <div className="flex items-start gap-2 rounded-lg border border-teal/30 bg-teal/10 px-3 py-2 text-sm text-foreground"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal" />{success}</div>}
                  </div>
                )}
                <div className="mx-auto max-w-5xl p-5 pb-28 md:p-8 md:pb-28">{content}</div>
              </main>
              <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t border-hairline bg-surface/95 px-5 py-3 backdrop-blur md:left-56">
                <Button variant="outline" disabled={stepIndex === 0} onClick={() => setStepIndex((value) => Math.max(0, value - 1))}>
                  <ArrowLeft className="mr-1 h-4 w-4" /> Previous
                </Button>
                <span className="hidden text-xs text-muted-foreground sm:block">Step {stepIndex + 1} of {steps.length}</span>
                <Button disabled={stepIndex === steps.length - 1} onClick={() => setStepIndex((value) => Math.min(steps.length - 1, value + 1))}>
                  Next <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
