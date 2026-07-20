import { useState, useEffect } from "react";
import { apiRequest } from "@/api/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, Save, CheckCircle2, ShieldAlert, Download, Copy, Check, FileDown, Printer } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChargesheetEditorProps {
  caseId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ChargesheetEditor({ caseId, isOpen, onClose }: ChargesheetEditorProps) {
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || !caseId) return;
    
    let cancelled = false;
    setIsLoading(true);
    setDraft("");
    setError("");
    
    apiRequest(`/api/cases/${caseId}/chargesheet`)
      .then((res) => {
        if (!cancelled && res.chargesheetDraft) {
          setDraft(res.chargesheetDraft);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
      
    return () => {
      cancelled = true;
    };
  }, [caseId, isOpen]);

  const handleGenerate = async () => {
    if (!caseId) return;
    setIsGenerating(true);
    setError("");
    try {
      const data = await apiRequest(`/api/cases/${caseId}/chargesheet/generate`, {
        method: "POST",
      });
      setDraft(data.chargesheet);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!caseId) return;
    setIsSaving(true);
    setError("");
    setSaveStatus("idle");
    try {
      await apiRequest(`/api/cases/${caseId}/chargesheet`, {
        method: "PUT",
        body: JSON.stringify({ chargesheetDraft: draft }),
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportDoc = () => {
    if (!draft) return;
    const proseDiv = document.getElementById("chargesheet-preview");
    if (!proseDiv) return;
    
    const html = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Chargesheet</title></head>
      <body>${proseDiv.innerHTML}</body>
      </html>
    `;
    const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Chargesheet_${caseId}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    if (!draft) return;
    const proseDiv = document.getElementById("chargesheet-preview");
    if (!proseDiv) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Chargesheet - ${caseId}</title>
          <style>
            body { font-family: serif; line-height: 1.6; padding: 40px; color: black; max-width: 800px; margin: auto; }
            h1, h2, h3 { color: black; margin-top: 1.5em; margin-bottom: 0.5em; }
            p { margin-bottom: 1em; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 1em; }
            th, td { border: 1px solid black; padding: 8px; text-align: left; }
            strong { font-weight: bold; }
          </style>
        </head>
        <body>
          ${proseDiv.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const handleCopy = () => {
    if (!draft) return;
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[90vw] w-full h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-background">
        <DialogHeader className="p-4 border-b border-border bg-surface shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl flex items-center gap-2">
              <FileText className="w-5 h-5 text-teal" />
              Interactive Chargesheet Draft
            </DialogTitle>
            <div className="flex items-center gap-2 pr-8">
              {saveStatus === "saved" && (
                <span className="flex items-center gap-1.5 text-xs text-teal font-medium mr-2">
                  <CheckCircle2 className="w-4 h-4" /> Saved
                </span>
              )}
              {draft && (
                <>
                  <Button 
                    onClick={handleCopy} 
                    variant="outline"
                    className="flex items-center gap-2"
                    size="sm"
                  >
                    {copied ? <Check className="w-4 h-4 text-teal" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                  <Button 
                    onClick={handleExportPdf} 
                    variant="outline"
                    className="flex items-center gap-2"
                    size="sm"
                  >
                    <Printer className="w-4 h-4" />
                    PDF / Print
                  </Button>
                  <Button 
                    onClick={handleExportDoc} 
                    variant="outline"
                    className="flex items-center gap-2"
                    size="sm"
                  >
                    <FileDown className="w-4 h-4" />
                    Word (.doc)
                  </Button>
                  <Button 
                    onClick={handleSave} 
                    disabled={isSaving}
                    className="bg-teal hover:bg-teal-hover text-white flex items-center gap-2"
                    size="sm"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden relative bg-background">
          {isLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">Loading draft...</p>
            </div>
          ) : error && !draft ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
              <ShieldAlert className="w-12 h-12 text-danger mb-4" />
              <h3 className="text-lg font-medium text-danger">Error</h3>
              <p className="text-muted-foreground mt-2">{error}</p>
            </div>
          ) : !draft ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-2 p-6 text-center">
              <FileText className="w-16 h-16 text-muted-foreground mb-6 opacity-50" />
              <h2 className="text-2xl font-medium tracking-tight mb-3">No Draft Found</h2>
              <p className="text-muted-foreground max-w-md mb-8">
                Generate an initial Section 173 CrPC draft using AI. The AI will analyze the FIR and case facts. You can edit the output manually afterwards.
              </p>
              <Button 
                onClick={handleGenerate} 
                disabled={isGenerating}
                size="lg"
                className="bg-ink hover:bg-ink/90 text-white shadow-lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Drafting Legal Document...
                  </>
                ) : (
                  "Generate Initial Draft via AI"
                )}
              </Button>
            </div>
          ) : (
            <div className="absolute inset-0 flex divide-x divide-border">
              {/* Left Side: Editor */}
              <div className="flex-1 flex flex-col bg-background">
                <div className="bg-surface-2 px-4 py-2 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Editor (Markdown)
                </div>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="flex-1 w-full p-6 resize-none bg-transparent outline-none text-sm font-mono text-foreground focus:ring-0 leading-relaxed"
                  placeholder="Type your draft here..."
                  spellCheck={false}
                />
              </div>

              {/* Right Side: Preview */}
              <div className="flex-1 flex flex-col bg-surface overflow-hidden">
                <div className="bg-surface-2 px-4 py-2 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider flex justify-between items-center">
                  <span>Live Preview</span>
                  <span className="text-[10px] text-amber flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" />
                    Verify AI facts
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-8">
                  <div id="chargesheet-preview" className="prose prose-slate dark:prose-invert max-w-none text-[15px] leading-[1.7] font-serif">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {draft}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
