import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { UploadCloud, FileText, ScanSearch, Sparkles, Check } from "lucide-react";
import { GlassPanel, GlassPill, GlassButton, GlassInput, IconOrb, SectionLabel } from "@/components/scrb/primitives";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/fir-upload")({
  head: () => ({ meta: [{ title: "FIR Upload — SCRB Sahayak" }] }),
  component: FirUpload,
});

const STEPS = [
  { id: "read", label: "Reading document", icon: FileText },
  { id: "extract", label: "Extracting entities", icon: ScanSearch },
  { id: "match", label: "Searching matches", icon: Sparkles },
  { id: "summary", label: "Generating summary", icon: Check },
] as const;

function FirUpload() {
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [current, setCurrent] = useState(-1);
  const [dragOver, setDragOver] = useState(false);

  const run = () => {
    setPhase("running");
    setCurrent(0);
    STEPS.forEach((_, i) =>
      setTimeout(() => {
        setCurrent(i);
        if (i === STEPS.length - 1) setTimeout(() => setPhase("done"), 700);
      }, i * 800),
    );
  };

  return (
    <div className="space-y-6">
      <GlassPanel strong className="p-8 sm:p-10">
        <div className="text-center">
          <SectionLabel>FIR Intake</SectionLabel>
          <h1 className="text-display mt-1 text-3xl">Upload a First Information Report</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sahayak will read, extract entities, search for prior matches and draft a summary.</p>
        </div>

        <button
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); run(); }}
          onClick={run}
          className={cn(
            "mx-auto mt-8 flex w-full max-w-2xl flex-col items-center justify-center gap-3 rounded-[32px] border-2 border-dashed p-12 text-center transition",
            dragOver ? "border-amber/70 bg-amber/5" : "border-hairline bg-surface-2 hover:border-foreground/20",
          )}
        >
          <IconOrb tone="amber" size="lg"><UploadCloud className="h-6 w-6" /></IconOrb>
          <p className="text-display text-lg">Drop FIR PDF or scanned image here</p>
          <p className="text-xs text-muted-foreground">or click to browse — encrypted in transit, retained under audit policy</p>
          <GlassPill tone="muted">Supports .pdf, .jpg, .png · up to 20 MB</GlassPill>
        </button>
      </GlassPanel>

      {phase !== "idle" && (
        <GlassPanel strong className="p-6">
          <SectionLabel>Extraction pipeline</SectionLabel>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            {STEPS.map((s, i) => {
              const active = i === current && phase === "running";
              const done = i < current || phase === "done";
              return (
                <div
                  key={s.id}
                  className={cn(
                    "glass rounded-3xl p-4 transition",
                    active && "ring-2 ring-amber/50",
                    done && "brightness-110",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <IconOrb tone={done ? "teal" : active ? "amber" : "glass"} size="sm">
                      {done ? <Check className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
                    </IconOrb>
                    <p className="text-sm font-medium">{s.label}</p>
                  </div>
                  <p className={cn("text-mono mt-2 text-[10px] tracking-wider uppercase", done ? "text-teal-soft" : active ? "text-amber-soft" : "text-muted-foreground")}>
                    {done ? "Complete" : active ? "Working…" : "Queued"}
                  </p>
                </div>
              );
            })}
          </div>
        </GlassPanel>
      )}

      {phase === "done" && (
        <GlassPanel strong className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <SectionLabel>Extracted fields · Editable</SectionLabel>
              <h2 className="text-display mt-1 text-xl">Draft FIR record</h2>
            </div>
            <div className="flex gap-2">
              <GlassButton variant="glass" size="sm">Reject</GlassButton>
              <GlassButton variant="primary" size="sm">Confirm & save</GlassButton>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              { l: "FIR Number", v: "FIR-2026-1067" },
              { l: "Section", v: "IPC 379, 356" },
              { l: "Complainant", v: "S. Deshpande" },
              { l: "Suspect (alias)", v: "'Chotu'" },
              { l: "Vehicle", v: "KA-05-MJ-8721" },
              { l: "Location", v: "Trinity Circle, MG Road" },
            ].map((f) => (
              <div key={f.l}>
                <label className="text-mono mb-1 block text-[10px] tracking-widest text-muted-foreground uppercase">{f.l}</label>
                <GlassInput defaultValue={f.v} className="text-mono" />
              </div>
            ))}
          </div>

          <div className="glass-teal mt-5 rounded-3xl p-4">
            <p className="text-xs text-teal-soft">AI summary</p>
            <p className="mt-1 text-sm leading-relaxed">
              Chain-snatching incident near Trinity Circle on 14 Jun. Two-wheeler-borne suspect(s). Vehicle plate matches prior FIR-2026-1039 (Indiranagar). Linkage confidence 88%.
            </p>
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
