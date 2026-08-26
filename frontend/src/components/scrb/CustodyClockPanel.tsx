import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileCheck2, Gavel, Loader2, Pencil, ShieldAlert, Timer } from "lucide-react";
import { apiRequest } from "@/api/client";
import { Badge, Button, Card, Input, SectionLabel, Select } from "@/components/scrb/primitives";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

type CasePerson = {
  id: string;
  role: string;
  person: { id: string; name: string };
};

type CustodyClock = {
  id: string;
  casePersonId: string;
  personName: string;
  firstRemandAt: string;
  windowDays: 60 | 90;
  thresholdBasis: "DEATH_LIFE_OR_TEN_YEARS_OR_MORE" | "OTHER_OFFENCE";
  legalSectionDetails: string;
  remandOrderReference: string;
  notes?: string | null;
  completionDate: string;
  defaultBailRiskAt: string;
  daysLeft: number;
  elapsedDays: number;
  tier: "COMPLIANT" | "ON_TRACK" | "WATCH" | "URGENT" | "OVERDUE";
  filingStatus: "NOT_FILED" | "FILED_IN_TIME" | "FILED_AFTER_WINDOW";
  reportFiledAt?: string | null;
  reportReference?: string | null;
};

type FormValues = {
  casePersonId: string;
  newAccusedName?: string;
  firstRemandAt: string;
  windowDays: "60" | "90";
  legalSectionDetails: string;
  remandOrderReference: string;
  notes: string;
  acknowledgeFirstRemand: boolean;
};

const INDIA_TIME_ZONE = "Asia/Kolkata";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: INDIA_TIME_ZONE,
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: INDIA_TIME_ZONE,
  }).format(new Date(value));
}

function inputDateTime(value = new Date()) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function initialForm(casePersonId = ""): FormValues {
  return {
    casePersonId,
    newAccusedName: "",
    firstRemandAt: inputDateTime(),
    windowDays: "60",
    legalSectionDetails: "",
    remandOrderReference: "",
    notes: "",
    acknowledgeFirstRemand: false,
  };
}

function toneForClock(clock: CustodyClock): "danger" | "amber" | "teal" | "muted" {
  if (clock.tier === "OVERDUE") return "danger";
  if (clock.tier === "URGENT" || clock.tier === "WATCH") return "amber";
  if (clock.tier === "COMPLIANT") return "muted";
  return "teal";
}

function clockLabel(clock: CustodyClock) {
  if (clock.filingStatus === "FILED_IN_TIME") return "Filing recorded in time";
  if (clock.filingStatus === "FILED_AFTER_WINDOW") return "Filing recorded after window";
  if (clock.daysLeft < 0) return `${Math.abs(clock.daysLeft)} day${Math.abs(clock.daysLeft) === 1 ? "" : "s"} past risk date`;
  if (clock.daysLeft === 0) return "Risk date is today";
  return `${clock.daysLeft} day${clock.daysLeft === 1 ? "" : "s"} to risk date`;
}

export function CustodyClockPanel({
  caseId,
  casePersons,
  canEdit,
}: {
  caseId: string;
  casePersons: CasePerson[];
  canEdit: boolean;
}) {
  const accused = useMemo(() => casePersons.filter((item) => item.role === "ACCUSED"), [casePersons]);
  const [clocks, setClocks] = useState<CustodyClock[]>([]);
  const [storageReady, setStorageReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"remand" | "filing" | null>(null);
  const [form, setForm] = useState<FormValues>(() => initialForm());
  const [filingAt, setFilingAt] = useState(inputDateTime());
  const [filingReference, setFilingReference] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const result = await apiRequest(`/api/cases/${caseId}/custody-clocks`);
      setClocks(result.clocks || []);
      setStorageReady(result.storageReady !== false);
    } catch (error: any) {
      toast.error(error.message || "Failed to load custody clocks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void load();
  }, [caseId]);

  const openRemand = (clock?: CustodyClock) => {
    if (clock) {
      setForm({
        casePersonId: clock.casePersonId,
        firstRemandAt: inputDateTime(new Date(clock.firstRemandAt)),
        windowDays: String(clock.windowDays) as "60" | "90",
        legalSectionDetails: clock.legalSectionDetails,
        remandOrderReference: clock.remandOrderReference,
        notes: clock.notes || "",
        acknowledgeFirstRemand: false,
      });
    } else {
      setForm(initialForm(accused[0]?.id || ""));
    }
    setMode("remand");
  };

  const saveRemand = async () => {
    if (!form.casePersonId || (form.casePersonId === "ADD_CUSTOM" && !form.newAccusedName?.trim()) || !form.legalSectionDetails.trim() || !form.remandOrderReference.trim()) {
      toast.error("Accused, offence/section details, and remand-order reference are required");
      return;
    }
    if (!form.acknowledgeFirstRemand) {
      toast.error("Confirm that this is the first Magistrate-authorised remand for this FIR");
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/api/cases/${caseId}/custody-clocks`, {
        method: "POST",
        body: JSON.stringify({
          casePersonId: form.casePersonId,
          newAccusedName: form.casePersonId === "ADD_CUSTOM" ? form.newAccusedName?.trim() : undefined,
          firstRemandAt: new Date(form.firstRemandAt).toISOString(),
          windowDays: Number(form.windowDays),
          thresholdBasis: form.windowDays === "90" ? "DEATH_LIFE_OR_TEN_YEARS_OR_MORE" : "OTHER_OFFENCE",
          legalSectionDetails: form.legalSectionDetails.trim(),
          remandOrderReference: form.remandOrderReference.trim(),
          notes: form.notes.trim() || null,
          acknowledgeFirstRemand: true,
        }),
      });
      toast.success("First-remand clock recorded");
      setMode(null);
      await load();
    } catch (error: any) {
      toast.error(error.message || "Failed to record first remand");
    } finally {
      setSaving(false);
    }
  };

  const saveFiling = async () => {
    if (!filingReference.trim()) {
      toast.error("Filing reference is required");
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest(`/api/cases/${caseId}/custody-clocks/record-filing`, {
        method: "POST",
        body: JSON.stringify({
          filedAt: new Date(filingAt).toISOString(),
          reportReference: filingReference.trim(),
        }),
      });
      toast.success(`Filing recorded for ${result.updatedClockCount} custody clock(s)`);
      setMode(null);
      await load();
    } catch (error: any) {
      toast.error(error.message || "Failed to record filing");
    } finally {
      setSaving(false);
    }
  };

  const hasActiveClock = clocks.some((clock) => clock.filingStatus === "NOT_FILED");

  return (
    <Card accent="danger" className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
            <Gavel className="h-4.5 w-4.5" />
          </div>
          <div>
            <SectionLabel className="mb-1">BNSS 187(3) custody clock</SectionLabel>
            <p className="text-sm font-medium text-foreground">Per accused · starts at first Magistrate-authorised remand</p>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
              Do not start this from FIR registration, a lead, or finding a suspect. Verify the applicable offence and the first remand order.
            </p>
          </div>
        </div>
        {canEdit && storageReady && accused.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {hasActiveClock && (
              <Button variant="secondary" size="sm" onClick={() => setMode("filing")}>
                <FileCheck2 className="h-3.5 w-3.5" /> Record filing
              </Button>
            )}
            <Button size="sm" onClick={() => openRemand()}>
              <Timer className="h-3.5 w-3.5" /> Record first remand
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="mt-4 h-16 animate-pulse rounded-xl bg-surface-2" />
      ) : !storageReady ? (
        <div className="mt-4 flex gap-2 rounded-xl border border-amber/40 bg-amber/10 p-3 text-xs text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
          This environment still needs database migration 0009 before custody clocks can be recorded. Other case features remain available.
        </div>
      ) : accused.length === 0 ? (
        <p className="mt-4 rounded-xl bg-surface-2 p-3 text-xs text-muted-foreground">
          No accused is linked to this FIR yet. Add or confirm an accused before recording a remand clock.
        </p>
      ) : clocks.length === 0 ? (
        <p className="mt-4 rounded-xl bg-surface-2 p-3 text-xs text-muted-foreground">
          No first-remand clock has been recorded. This FIR is not shown as a statutory default-bail risk until a verified remand record is added.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {clocks.map((clock) => (
            <div key={clock.id} className="rounded-xl border border-hairline bg-surface-2 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{clock.personName}</p>
                    <Badge tone={toneForClock(clock)}>{clock.windowDays}-day window</Badge>
                    <Badge tone={toneForClock(clock)}>{clockLabel(clock)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    First remand: {formatDateTime(clock.firstRemandAt)} IST · day {clock.elapsedDays} · period completes {formatDate(`${clock.completionDate}T00:00:00+05:30`)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {clock.legalSectionDetails} · order: {clock.remandOrderReference}
                    {clock.reportReference ? ` · filing: ${clock.reportReference}` : ""}
                  </p>
                </div>
                {canEdit && clock.filingStatus === "NOT_FILED" && (
                  <Button variant="ghost" size="sm" onClick={() => openRemand(clock)}>
                    <Pencil className="h-3.5 w-3.5" /> Correct
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={mode === "remand"} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-hairline bg-background p-6 sm:max-w-[620px] rounded-3xl">
          <DialogHeader>
            <DialogTitle>Record first remand</DialogTitle>
            <DialogDescription>
              This starts a per-accused operational tracker. It is not a substitute for the court record or legal review.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block text-xs font-medium text-muted-foreground">Accused
              <Select value={form.casePersonId} onChange={(event) => setForm((current) => ({ ...current, casePersonId: event.target.value }))} className="mt-1">
                {accused.map((person) => <option key={person.id} value={person.id}>{person.person.name}</option>)}
                <option value="ADD_CUSTOM">+ Add custom suspect</option>
              </Select>
            </label>
            {form.casePersonId === "ADD_CUSTOM" && (
              <label className="block text-xs font-medium text-muted-foreground">Custom suspect name
                <Input value={form.newAccusedName || ""} onChange={(event) => setForm((current) => ({ ...current, newAccusedName: event.target.value }))} placeholder="Enter full name of suspect" className="mt-1" />
              </label>
            )}
            <label className="block text-xs font-medium text-muted-foreground">First Magistrate-authorised remand date and time
              <Input type="datetime-local" value={form.firstRemandAt} max={inputDateTime()} onChange={(event) => setForm((current) => ({ ...current, firstRemandAt: event.target.value }))} className="mt-1" />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">Statutory window after checking alleged offence and maximum punishment
              <Select value={form.windowDays} onChange={(event) => setForm((current) => ({ ...current, windowDays: event.target.value as "60" | "90" }))} className="mt-1">
                <option value="60">60 days — any other offence</option>
                <option value="90">90 days — death, life imprisonment, or 10 years or more</option>
              </Select>
            </label>
            <label className="block text-xs font-medium text-muted-foreground">Alleged BNS / other section(s) and maximum-punishment check
              <Input value={form.legalSectionDetails} onChange={(event) => setForm((current) => ({ ...current, legalSectionDetails: event.target.value }))} placeholder="e.g. BNS section(s); maximum punishment checked" className="mt-1" />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">First remand order / court reference
              <Input value={form.remandOrderReference} onChange={(event) => setForm((current) => ({ ...current, remandOrderReference: event.target.value }))} placeholder="e.g. court / remand order number" className="mt-1" />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">Notes (optional)
              <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="mt-1 min-h-20 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ink" />
            </label>
            <label className="flex gap-2 rounded-xl border border-amber/40 bg-amber/10 p-3 text-xs leading-relaxed text-foreground">
              <input type="checkbox" checked={form.acknowledgeFirstRemand} onChange={(event) => setForm((current) => ({ ...current, acknowledgeFirstRemand: event.target.checked }))} className="mt-0.5" />
              I verified this is the first Magistrate-authorised remand into custody for this accused in this FIR. Arrest, suspect identification, and FIR registration alone do not start this tracker.
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMode(null)} disabled={saving}>Cancel</Button>
            <Button onClick={saveRemand} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />} Save remand clock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "filing"} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent className="border-hairline bg-background p-6 sm:max-w-[520px] rounded-3xl">
          <DialogHeader>
            <DialogTitle>Record final report / charge-sheet filing</DialogTitle>
            <DialogDescription>
              This marks all active accused clocks in this FIR with the same filing reference. A draft does not stop the tracker.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block text-xs font-medium text-muted-foreground">Filing date and time
              <Input type="datetime-local" value={filingAt} max={inputDateTime()} onChange={(event) => setFilingAt(event.target.value)} className="mt-1" />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">Court / filing reference
              <Input value={filingReference} onChange={(event) => setFilingReference(event.target.value)} placeholder="Diary, court, or filing reference" className="mt-1" />
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMode(null)} disabled={saving}>Cancel</Button>
            <Button onClick={saveFiling} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />} Record filing</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
