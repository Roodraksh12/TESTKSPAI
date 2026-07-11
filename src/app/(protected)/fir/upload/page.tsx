"use client";

import { useState } from "react";
import { UploadCloud, FileText, Check, AlertCircle, Save, Loader2, RefreshCw, ChevronRight, ScanSearch, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { Card, Badge, Button, Input, IconOrb, SectionLabel } from "@/components/scrb/primitives";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "read", label: "Reading document", icon: FileText },
  { id: "extract", label: "Extracting entities", icon: ScanSearch },
  { id: "match", label: "Searching matches", icon: Sparkles },
  { id: "summary", label: "Generating summary", icon: Check },
] as const;

export default function FIRUploadPage() {
  const [inputMode, setInputMode] = useState<"upload" | "magic">("upload");
  const [magicNotes, setMagicNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [currentStep, setCurrentStep] = useState(-1);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [rawText, setRawText] = useState("");
  const [possibleMatches, setPossibleMatches] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const router = useRouter();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleMagicDraft = async () => {
    if (!magicNotes.trim()) return;
    setPhase("running");
    setError("");

    setCurrentStep(0);
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev < 3 ? prev + 1 : prev));
    }, 1500);

    try {
      const res = await fetch("/api/ai/draft-fir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: magicNotes }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Draft failed");

      clearInterval(interval);
      setCurrentStep(3);
      
      setTimeout(() => {
        setExtractedData(data.extractedData);
        setRawText(data.rawText);
        setPossibleMatches(data.possibleMatches);
        setPhase("done");
      }, 800);
      
    } catch (err: any) {
      clearInterval(interval);
      setError(err.message);
      setPhase("idle");
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setPhase("running");
    setError("");

    // Simulate steps progress visually
    setCurrentStep(0);
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev < 3 ? prev + 1 : prev));
    }, 1500);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/fir/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      clearInterval(interval);
      setCurrentStep(3);
      
      setTimeout(() => {
        setExtractedData(data.extractedData);
        setRawText(data.rawText);
        setPossibleMatches(data.possibleMatches);
        setPhase("done");
      }, 800);
      
    } catch (err: any) {
      clearInterval(interval);
      setError(err.message);
      setPhase("idle");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...extractedData,
          rawText,
          possibleMatches
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save case");
      
      router.push(`/cases/${data.caseId}/tactical`);
    } catch (err: any) {
      setError(err.message);
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setExtractedData(null);
    setRawText("");
    setPossibleMatches([]);
    setError("");
    setPhase("idle");
    setCurrentStep(-1);
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8">
      {phase === "idle" && (
        <Card strong className="p-8 sm:p-10">
          <div className="text-center">
            <SectionLabel>FIR Intake</SectionLabel>
            <h1 className="text-display mt-1 text-3xl">Upload a First Information Report</h1>
            <p className="mt-2 text-sm text-muted-foreground">Sahayak will read, extract entities, search for prior matches and draft a summary.</p>
          </div>

          <div className="flex justify-center mt-6">
            <div className="glass inline-flex rounded-2xl p-1">
              <button
                onClick={() => setInputMode("upload")}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition",
                  inputMode === "upload" ? "bg-muted text-foreground shadow-inner" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <UploadCloud className="w-4 h-4" /> Upload Document
              </button>
              <button
                onClick={() => setInputMode("magic")}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition",
                  inputMode === "magic" ? "bg-amber-500/10 text-amber-500 shadow-inner" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Sparkles className="w-4 h-4" /> Magic Draft
              </button>
            </div>
          </div>

          {inputMode === "upload" ? (
            <>
              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={cn(
                  "mx-auto mt-8 flex w-full max-w-2xl flex-col items-center justify-center gap-3 rounded-[32px] border-2 border-dashed p-12 text-center transition cursor-pointer relative",
                  dragOver ? "border-amber/70 bg-amber/5" : "border-hairline bg-surface-2 hover:border-foreground/20",
                )}
              >
                <input 
                  type="file" 
                  accept="application/pdf, image/png, image/jpeg, image/jpg" 
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <IconOrb tone="amber" size="lg"><UploadCloud className="h-6 w-6" /></IconOrb>
                <p className="text-display text-lg">{file ? file.name : "Drop FIR PDF or scanned image here"}</p>
                <p className="text-xs text-muted-foreground">or click to browse — encrypted in transit, retained under audit policy</p>
                <Badge tone="muted">Supports .pdf, .jpg, .png · up to 20 MB</Badge>
              </label>
              
              {file && (
                <div className="mt-6 flex justify-center">
                  <Button onClick={handleUpload} variant="primary" size="lg">
                    Run Extraction <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="mx-auto mt-8 max-w-2xl">
              <textarea
                value={magicNotes}
                onChange={(e) => setMagicNotes(e.target.value)}
                placeholder="Type your raw field notes here... e.g. 'A guy named Sunil snatched a gold chain from a lady at MG Road metro station yesterday at 9 PM.'"
                className="w-full h-48 bg-surface-2 border border-hairline rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none custom-scrollbar"
              />
              <div className="mt-6 flex justify-center">
                <Button onClick={handleMagicDraft} variant="primary" size="lg" disabled={!magicNotes.trim()}>
                  <Sparkles className="w-4 h-4 mr-2" /> Generate FIR
                </Button>
              </div>
            </div>
          )}

          {error && (
            <p className="text-destructive mt-6 font-medium flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4" /> {error}
            </p>
          )}
        </Card>
      )}

      {phase === "running" && (
        <Card strong className="p-6">
          <SectionLabel>Extraction pipeline</SectionLabel>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            {STEPS.map((s, i) => {
              const active = i === currentStep;
              const done = i < currentStep;
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
        </Card>
      )}

      {phase === "done" && extractedData && (
        <Card strong className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <SectionLabel>Extracted fields · Editable</SectionLabel>
              <h2 className="text-display mt-1 text-xl">Draft FIR record</h2>
            </div>
            <div className="flex gap-2">
              <Button variant="glass" size="sm" onClick={resetForm} disabled={isSaving}>Reject</Button>
              <Button variant="primary" size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Confirm & save"}
              </Button>
            </div>
          </div>

          <form id="case-form" onSubmit={handleSave} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="text-mono mb-1 block text-[10px] tracking-widest text-muted-foreground uppercase">Crime Type</label>
              <Input 
                value={extractedData.crimeType} 
                onChange={e => setExtractedData({...extractedData, crimeType: e.target.value})}
              />
            </div>
            <div>
              <label className="text-mono mb-1 block text-[10px] tracking-widest text-muted-foreground uppercase">Incident Date</label>
              <Input 
                value={extractedData.incidentDate} 
                onChange={e => setExtractedData({...extractedData, incidentDate: e.target.value})}
              />
            </div>
            <div>
              <label className="text-mono mb-1 block text-[10px] tracking-widest text-muted-foreground uppercase">Location</label>
              <Input 
                value={extractedData.location} 
                onChange={e => setExtractedData({...extractedData, location: e.target.value})}
              />
            </div>
            <div>
              <label className="text-mono mb-1 block text-[10px] tracking-widest text-muted-foreground uppercase">Accused</label>
              <Input 
                value={extractedData.accusedNames?.join(", ") || ""} 
                onChange={e => setExtractedData({...extractedData, accusedNames: e.target.value.split(",").map((n: string) => n.trim())})}
              />
            </div>
            <div>
              <label className="text-mono mb-1 block text-[10px] tracking-widest text-muted-foreground uppercase">Victim</label>
              <Input 
                value={extractedData.victimName || ""} 
                onChange={e => setExtractedData({...extractedData, victimName: e.target.value})}
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="text-mono mb-1 block text-[10px] tracking-widest text-muted-foreground uppercase">Narrative</label>
              <textarea 
                value={extractedData.narrativeSummary} 
                onChange={e => setExtractedData({...extractedData, narrativeSummary: e.target.value})} 
                rows={4}
                required
                className="w-full bg-surface border border-hairline rounded-[16px] focus:outline-none focus:ring-1 focus:ring-amber p-4 text-sm leading-relaxed"
              />
            </div>
          </form>

          {possibleMatches.length > 0 && (
            <div className="glass-amber mt-5 rounded-3xl p-4">
              <p className="text-xs text-amber-soft flex items-center gap-1 font-semibold">
                <AlertCircle className="w-3 h-3" /> System Alerts
              </p>
              <ul className="mt-2 space-y-2">
                {possibleMatches.map((match, i) => (
                  <li key={i} className="text-sm">
                    <strong>{match.name}:</strong> {match.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="glass mt-5 rounded-3xl p-4 opacity-70">
            <p className="text-xs text-muted-foreground mb-2">Raw OCR Text</p>
            <div className="text-[10px] font-mono text-muted-foreground h-32 overflow-y-auto whitespace-pre-wrap">
              {rawText}
            </div>
          </div>
          
          {error && <p className="text-destructive mt-4 text-sm">{error}</p>}
        </Card>
      )}
    </div>
  );
}
