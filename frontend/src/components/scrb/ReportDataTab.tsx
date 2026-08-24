import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ClipboardList, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { apiRequest } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/scrb/primitives";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type SourceCollection = {
  parties: any[];
  events: any[];
  legalSections: any[];
  propertyItems: any[];
  expertResults: any[];
  evidenceAssessments: any[];
  documents: any[];
  custodyClocks: any[];
};

type SourceResponse = {
  storageReady: boolean;
  revision: number;
  sources: SourceCollection | null;
  validation?: { ready: boolean; counts: { errors: number; explanations: number }; issues: any[] };
};

const sections = [
  { id: "people", label: "People & chronology" },
  { id: "law", label: "Legal sections" },
  { id: "results", label: "Property & results" },
] as const;

const inputClass = "w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-teal focus:ring-1 focus:ring-teal disabled:opacity-60";
const labelClass = "space-y-1 text-xs font-medium text-muted-foreground";

function cloneSources(value: SourceCollection): SourceCollection {
  return JSON.parse(JSON.stringify(value));
}

function localDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function newKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ReportDataTab({ caseId, canEdit }: { caseId: string; canEdit: boolean }) {
  const [result, setResult] = useState<SourceResponse | null>(null);
  const [draft, setDraft] = useState<SourceCollection | null>(null);
  const [section, setSection] = useState<(typeof sections)[number]["id"]>("people");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");

  const install = (next: SourceResponse) => {
    setResult(next);
    setDraft(next.sources ? cloneSources(next.sources) : null);
    setDirty(false);
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      install(await apiRequest(`/api/cases/${caseId}/report-sources`, { fresh: true }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load report data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [caseId]);

  const mutate = (recipe: (next: SourceCollection) => void) => {
    if (!draft || !canEdit) return;
    const next = cloneSources(draft);
    recipe(next);
    setDraft(next);
    setDirty(true);
  };

  const save = async () => {
    if (!draft || !result) return;
    setSaving(true);
    setError("");
    try {
      const next = await apiRequest(`/api/cases/${caseId}/report-sources`, {
        method: "PUT",
        body: JSON.stringify({
          expectedRevision: result.revision,
          payload: {
            parties: draft.parties,
            events: draft.events,
            legalSections: draft.legalSections,
            propertyItems: draft.propertyItems,
            expertResults: draft.expertResults,
            evidenceAssessments: draft.evidenceAssessments,
          },
        }),
      });
      install(next);
      toast.success("Case report data saved. Refresh the final-report draft when ready.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save report data.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center rounded-3xl border border-hairline p-12"><Loader2 className="h-6 w-6 animate-spin text-teal" /></div>;
  }
  if (error && !result) {
    return <StateMessage title="Report data could not be loaded" detail={error} action={() => void load()} />;
  }
  if (!result?.storageReady || !draft) {
    return <StateMessage title="Report-data storage is not ready" detail="Apply database migration 0012 to the isolated test database, then retry. Existing case and final-report features remain available." action={() => void load()} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-hairline bg-surface p-4">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-teal" />
            <h2 className="font-semibold text-foreground">Verified report data</h2>
            <Badge tone="neutral">Revision {result.revision}</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Reusable investigation facts live here. Saving does not alter an existing final-report draft; use “Refresh case data” inside the report builder when you want to import missing values.
          </p>
        </div>
        {canEdit && (
          <Button disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Save report data
          </Button>
        )}
      </div>

      {(error || (result.validation?.issues.length || 0) > 0) && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><AlertTriangle className="h-4 w-4 text-amber-500" /> Checks requiring attention</div>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {(result.validation?.issues || []).map((issue) => <li key={`${issue.code}-${issue.path}`}>• {issue.message}</li>)}
          </ul>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-hairline bg-surface p-1">
        {sections.map((item) => (
          <button key={item.id} onClick={() => setSection(item.id)} className={cn("rounded-xl px-4 py-2 text-xs font-medium whitespace-nowrap", section === item.id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>{item.label}</button>
        ))}
      </div>

      {section === "people" && (
        <div className="space-y-4">
          {draft.parties.map((party, index) => (
            <div key={party.casePersonId} className="rounded-2xl border border-hairline bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><p className="font-semibold text-foreground">{party.name}</p><p className="text-xs text-muted-foreground">{party.role} · case-linked identity</p></div>
                <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <input type="checkbox" checked={Boolean(party.isComplainant)} disabled={!canEdit} onChange={(event) => mutate((next) => next.parties.forEach((row, rowIndex) => { row.isComplainant = rowIndex === index ? event.target.checked : false; }))} /> Primary complainant
                </label>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Alias" value={party.alias} disabled={!canEdit} onChange={(value) => mutate((next) => { next.parties[index].alias = value; })} />
                <Field label="Parent / guardian" value={party.parentName} disabled={!canEdit} onChange={(value) => mutate((next) => { next.parties[index].parentName = value; })} />
                <Field label="Birth year" type="number" value={party.birthYear} disabled={!canEdit} onChange={(value) => mutate((next) => { next.parties[index].birthYear = value; })} />
                <Field label="Occupation" value={party.occupation} disabled={!canEdit} onChange={(value) => mutate((next) => { next.parties[index].occupation = value; })} />
                <SelectField label="Identity status" value={party.identityStatus} options={["NOT_RECORDED", "PENDING", "VERIFIED", "UNVERIFIED"]} disabled={!canEdit} onChange={(value) => mutate((next) => { next.parties[index].identityStatus = value; })} />
                <Field label="Identity record type" value={party.identityType} disabled={!canEdit} onChange={(value) => mutate((next) => { next.parties[index].identityType = value; })} />
                <Field label="Identity reference" value={party.identityReference} disabled={!canEdit} onChange={(value) => mutate((next) => { next.parties[index].identityReference = value; })} />
                <Field label="Relationship to victim" value={party.relationshipToVictim} disabled={!canEdit} onChange={(value) => mutate((next) => { next.parties[index].relationshipToVictim = value; })} />
                {party.role === "ACCUSED" && <>
                  <SelectField label="Final disposition" value={party.disposition} options={["NOT_RECORDED", "CHARGE_SHEETED", "NOT_CHARGE_SHEETED"]} disabled={!canEdit} onChange={(value) => mutate((next) => { next.parties[index].disposition = value; })} />
                  <SelectField label="Bail status" value={party.bailStatus} options={["NOT_RECORDED", "IN_CUSTODY", "BAIL_GRANTED", "RELEASED_ON_BAIL", "ABSCONDING"]} disabled={!canEdit} onChange={(value) => mutate((next) => { next.parties[index].bailStatus = value; })} />
                  <Field label="Regular criminal no." value={party.regularCriminalNumber} disabled={!canEdit} onChange={(value) => mutate((next) => { next.parties[index].regularCriminalNumber = value; })} />
                  <Field label="Disposition reason" value={party.dispositionReason} disabled={!canEdit} onChange={(value) => mutate((next) => { next.parties[index].dispositionReason = value; })} />
                </>}
                {party.role === "VICTIM" && <Field label="Injury / loss" value={party.injuryOrLoss} disabled={!canEdit} onChange={(value) => mutate((next) => { next.parties[index].injuryOrLoss = value; })} />}
                {party.role === "WITNESS" && <Field label="Statement summary" value={party.statementSummary} disabled={!canEdit} onChange={(value) => mutate((next) => { next.parties[index].statementSummary = value; })} />}
              </div>
            </div>
          ))}

          <div className="rounded-2xl border border-hairline bg-surface p-4">
            <div className="flex items-center justify-between"><div><h3 className="font-semibold text-foreground">Accused chronology</h3><p className="text-xs text-muted-foreground">Arrest, court-forwarding and bail dates are checked for impossible order.</p></div>{canEdit && <Button variant="outline" size="sm" onClick={() => mutate((next) => next.events.push({ id: newKey("event"), casePersonId: next.parties.find((row) => row.role === "ACCUSED")?.casePersonId || "", eventType: "ARRESTED", occurredAt: new Date().toISOString(), reference: "", notes: "" }))}><Plus className="mr-1 h-4 w-4" /> Event</Button>}</div>
            <div className="mt-3 space-y-2">
              {draft.events.map((row, index) => (
                <div key={row.id} className="grid gap-2 rounded-xl bg-muted/40 p-3 md:grid-cols-[1fr_1fr_1fr_1.2fr_auto]">
                  <select className={inputClass} value={row.casePersonId} disabled={!canEdit} onChange={(event) => mutate((next) => { next.events[index].casePersonId = event.target.value; })}>{draft.parties.filter((party) => party.role === "ACCUSED").map((party) => <option key={party.casePersonId} value={party.casePersonId}>{party.name}</option>)}</select>
                  <select className={inputClass} value={row.eventType} disabled={!canEdit} onChange={(event) => mutate((next) => { next.events[index].eventType = event.target.value; })}>{["IDENTIFIED", "ARRESTED", "FORWARDED_TO_COURT", "BAIL_GRANTED", "RELEASED_ON_BAIL", "ABSCONDING", "SURRENDERED", "OTHER"].map((option) => <option key={option}>{option}</option>)}</select>
                  <input className={inputClass} type="datetime-local" value={localDateTime(row.occurredAt)} disabled={!canEdit} onChange={(event) => mutate((next) => { next.events[index].occurredAt = event.target.value; })} />
                  <input className={inputClass} placeholder="Order / memo reference" value={row.reference || ""} disabled={!canEdit} onChange={(event) => mutate((next) => { next.events[index].reference = event.target.value; })} />
                  {canEdit && <button className="rounded-lg p-2 text-muted-foreground hover:text-danger" onClick={() => mutate((next) => { next.events.splice(index, 1); })}><Trash2 className="h-4 w-4" /></button>}
                </div>
              ))}
              {draft.events.length === 0 && <p className="py-5 text-center text-xs text-muted-foreground">No person events recorded.</p>}
            </div>
          </div>
        </div>
      )}

      {section === "law" && (
        <div className="rounded-2xl border border-hairline bg-surface p-4">
          <div className="flex items-center justify-between"><div><h3 className="font-semibold text-foreground">FIR-to-final legal section decisions</h3><p className="text-xs text-muted-foreground">Record retained, added and dropped sections with reasons.</p></div>{canEdit && <Button variant="outline" size="sm" onClick={() => mutate((next) => next.legalSections.push({ id: newKey("section"), catalogId: null, actCode: "BNS", sectionNumber: "", title: "", punishment: "", conditionNote: "", initiallyAlleged: true, finalDecision: "NOT_RECORDED", decisionReason: "", approvalReference: "" }))}><Plus className="mr-1 h-4 w-4" /> Section</Button>}</div>
          <div className="mt-4 space-y-3">
            {draft.legalSections.map((row, index) => <div key={row.id} className="grid gap-2 rounded-xl border border-hairline p-3 md:grid-cols-[100px_120px_1.3fr_150px_1.3fr_auto]">
              <input className={inputClass} placeholder="Act" value={row.actCode} disabled={!canEdit} onChange={(event) => mutate((next) => { next.legalSections[index].actCode = event.target.value; })} />
              <input className={inputClass} placeholder="Section" value={row.sectionNumber} disabled={!canEdit} onChange={(event) => mutate((next) => { next.legalSections[index].sectionNumber = event.target.value; })} />
              <input className={inputClass} placeholder="Offence title" value={row.title} disabled={!canEdit} onChange={(event) => mutate((next) => { next.legalSections[index].title = event.target.value; })} />
              <select className={inputClass} value={row.finalDecision} disabled={!canEdit} onChange={(event) => mutate((next) => { next.legalSections[index].finalDecision = event.target.value; })}>{["NOT_RECORDED", "RETAINED", "ADDED", "DROPPED"].map((option) => <option key={option}>{option}</option>)}</select>
              <input className={inputClass} placeholder="Reason / investigation basis" value={row.decisionReason || ""} disabled={!canEdit} onChange={(event) => mutate((next) => { next.legalSections[index].decisionReason = event.target.value; })} />
              {canEdit && <button className="rounded-lg p-2 text-muted-foreground hover:text-danger" onClick={() => mutate((next) => { next.legalSections.splice(index, 1); })}><Trash2 className="h-4 w-4" /></button>}
            </div>)}
            {draft.legalSections.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">No legal-section decision has been recorded.</p>}
          </div>
        </div>
      )}

      {section === "results" && (
        <div className="space-y-4">
          <SourceList title="Case property" description="Recovered, seized or material property used in the filing." addLabel="Property" canEdit={canEdit} onAdd={() => mutate((next) => next.propertyItems.push({ id: newKey("property"), sourceEvidenceId: null, category: "OTHER", description: "", quantity: "", estimatedValue: "", recoveryStatus: "NOT_RECORDED", recoveredAt: "", seizureMemoReference: "", disposalStatus: "NOT_RECORDED" }))}>
            {draft.propertyItems.map((row, index) => <div key={row.id} className="grid gap-2 rounded-xl border border-hairline p-3 md:grid-cols-[150px_1.5fr_1fr_160px_auto]">
              <select className={inputClass} value={row.category} disabled={!canEdit} onChange={(event) => mutate((next) => { next.propertyItems[index].category = event.target.value; })}>{["OTHER", "WEAPON", "VEHICLE", "CURRENCY", "JEWELLERY", "DOCUMENT", "DIGITAL_DEVICE"].map((option) => <option key={option}>{option}</option>)}</select>
              <input className={inputClass} placeholder="Description" value={row.description} disabled={!canEdit} onChange={(event) => mutate((next) => { next.propertyItems[index].description = event.target.value; })} />
              <select className={inputClass} value={row.sourceEvidenceId || ""} disabled={!canEdit} onChange={(event) => mutate((next) => { next.propertyItems[index].sourceEvidenceId = event.target.value || null; })}><option value="">No linked evidence</option>{draft.evidenceAssessments.map((evidence) => <option key={evidence.evidenceId} value={evidence.evidenceId}>{evidence.description}</option>)}</select>
              <select className={inputClass} value={row.recoveryStatus} disabled={!canEdit} onChange={(event) => mutate((next) => { next.propertyItems[index].recoveryStatus = event.target.value; })}>{["NOT_RECORDED", "RECOVERED", "SEIZED", "NOT_RECOVERED"].map((option) => <option key={option}>{option}</option>)}</select>
              {canEdit && <button className="rounded-lg p-2 text-muted-foreground hover:text-danger" onClick={() => mutate((next) => { next.propertyItems.splice(index, 1); })}><Trash2 className="h-4 w-4" /></button>}
            </div>)}
          </SourceList>

          <SourceList title="Expert / forensic results" description="Track requested and received expert opinions without inventing a result." addLabel="Expert result" canEdit={canEdit} onAdd={() => mutate((next) => next.expertResults.push({ id: newKey("expert"), sourceDocumentId: null, type: "FSL", status: "PENDING", referenceNumber: "", resultDate: "", summary: "" }))}>
            {draft.expertResults.map((row, index) => <div key={row.id} className="grid gap-2 rounded-xl border border-hairline p-3 md:grid-cols-[130px_140px_1fr_1.5fr_auto]">
              <input className={inputClass} placeholder="Type" value={row.type} disabled={!canEdit} onChange={(event) => mutate((next) => { next.expertResults[index].type = event.target.value; })} />
              <select className={inputClass} value={row.status} disabled={!canEdit} onChange={(event) => mutate((next) => { next.expertResults[index].status = event.target.value; })}>{["NOT_RECORDED", "PENDING", "RECEIVED", "NOT_APPLICABLE"].map((option) => <option key={option}>{option}</option>)}</select>
              <select className={inputClass} value={row.sourceDocumentId || ""} disabled={!canEdit} onChange={(event) => mutate((next) => { next.expertResults[index].sourceDocumentId = event.target.value || null; })}><option value="">No linked document</option>{draft.documents.map((document) => <option key={document.id} value={document.id}>{document.name}</option>)}</select>
              <input className={inputClass} placeholder="Result summary" value={row.summary || ""} disabled={!canEdit} onChange={(event) => mutate((next) => { next.expertResults[index].summary = event.target.value; })} />
              {canEdit && <button className="rounded-lg p-2 text-muted-foreground hover:text-danger" onClick={() => mutate((next) => { next.expertResults.splice(index, 1); })}><Trash2 className="h-4 w-4" /></button>}
            </div>)}
          </SourceList>

          <SourceList title="Evidence outcomes" description="Add analysis status, result summary and laboratory or memo reference to existing evidence." canEdit={false}>
            {draft.evidenceAssessments.map((row, index) => <div key={row.evidenceId} className="grid gap-2 rounded-xl border border-hairline p-3 md:grid-cols-[1.2fr_150px_1.5fr_1fr]">
              <div><p className="text-sm font-medium text-foreground">{row.description}</p><p className="text-xs text-muted-foreground">{row.type}</p></div>
              <select className={inputClass} value={row.resultStatus} disabled={!canEdit} onChange={(event) => mutate((next) => { next.evidenceAssessments[index].resultStatus = event.target.value; })}>{["NOT_RECORDED", "PENDING", "RECEIVED", "NOT_APPLICABLE"].map((option) => <option key={option}>{option}</option>)}</select>
              <input className={inputClass} placeholder="Result summary" value={row.resultSummary || ""} disabled={!canEdit} onChange={(event) => mutate((next) => { next.evidenceAssessments[index].resultSummary = event.target.value; })} />
              <input className={inputClass} placeholder="Reference number" value={row.referenceNumber || ""} disabled={!canEdit} onChange={(event) => mutate((next) => { next.evidenceAssessments[index].referenceNumber = event.target.value; })} />
            </div>)}
          </SourceList>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, disabled, type = "text" }: { label: string; value?: string | number | null; onChange: (value: string) => void; disabled: boolean; type?: string }) {
  return <label className={labelClass}>{label}<input className={inputClass} type={type} value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>;
}

function SelectField({ label, value, options, onChange, disabled }: { label: string; value?: string; options: string[]; onChange: (value: string) => void; disabled: boolean }) {
  return <label className={labelClass}>{label}<select className={inputClass} value={value || options[0]} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function SourceList({ title, description, addLabel, canEdit, onAdd, children }: { title: string; description: string; addLabel?: string; canEdit: boolean; onAdd?: () => void; children: ReactNode }) {
  return <div className="rounded-2xl border border-hairline bg-surface p-4"><div className="flex items-center justify-between gap-2"><div><h3 className="font-semibold text-foreground">{title}</h3><p className="text-xs text-muted-foreground">{description}</p></div>{canEdit && onAdd && <Button variant="outline" size="sm" onClick={onAdd}><Plus className="mr-1 h-4 w-4" /> {addLabel}</Button>}</div><div className="mt-4 space-y-2">{children}</div></div>;
}

function StateMessage({ title, detail, action }: { title: string; detail: string; action: () => void }) {
  return <div className="rounded-3xl border border-hairline p-10 text-center"><AlertTriangle className="mx-auto h-7 w-7 text-amber-500" /><h3 className="mt-3 font-semibold text-foreground">{title}</h3><p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{detail}</p><Button variant="outline" className="mt-4" onClick={action}>Retry</Button></div>;
}
