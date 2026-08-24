import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ClipboardCheck, FileText, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChargesheetEditor } from "@/components/scrb/ChargesheetEditor";

export default function ChargesheetPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [open, setOpen] = useState(true);

  const returnToCase = () => {
    setOpen(false);
    if (id) navigate(`/cases/${id}`);
    else navigate("/cases");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-hairline bg-ink px-6 py-10 text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4">
          <Button
            variant="ghost"
            onClick={returnToCase}
            className="h-11 w-11 rounded-full p-0 text-white/75 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <FileText className="h-6 w-6 text-teal" /> Structured Final Report
            </h1>
            <p className="mt-1 text-sm text-white/65">BNSS section 193 provisional working format</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-6 md:p-10">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-hairline bg-surface p-6 shadow-sm">
            <ClipboardCheck className="h-7 w-7 text-teal" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">Structured, officer-controlled preparation</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Accused, alleged sections, evidence, witnesses and documents are selected from the case record and linked to supporting facts before submission.
            </p>
          </div>
          <div className="rounded-2xl border border-hairline bg-surface p-6 shadow-sm">
            <LockKeyhole className="h-7 w-7 text-teal" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">No external AI drafting in Phase 1</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              The report is assembled deterministically from saved records and officer input, with server validation, immutable versions and supervisory approval.
            </p>
          </div>
        </div>
        <div className="mt-6 rounded-2xl border border-amber/40 bg-amber/10 p-5">
          <p className="text-sm leading-relaxed text-foreground">
            This remains a configurable working packet until the Karnataka Police charge-sheet specimen is supplied and mapped. It must not be treated as a notified filing form.
          </p>
        </div>
        <Button className="mt-6 bg-ink text-white hover:bg-ink/90" onClick={() => setOpen(true)}>
          Open final report builder
        </Button>
      </main>

      <ChargesheetEditor caseId={id || null} isOpen={open} onClose={returnToCase} />
    </div>
  );
}
