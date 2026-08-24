import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/scrb/primitives";
import { Camera, Video, Mic, FlaskConical, FileText, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/api/client";

const TYPES = [
  { id: "PHOTO", label: "Photo", icon: Camera },
  { id: "VIDEO", label: "Video", icon: Video },
  { id: "VOICE", label: "Voice", icon: Mic },
  { id: "FORENSIC", label: "Forensic", icon: FlaskConical },
  { id: "MISC", label: "Misc", icon: FileText },
];

export function EvidenceForm({
  caseId,
  isOpen,
  onClose,
  onSuccess
}: {
  caseId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [type, setType] = useState("PHOTO");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast.error("Description is required");
      return;
    }
    
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("type", type);
      formData.append("description", description);
      files.forEach(f => formData.append("files", f));

      await apiRequest(`/api/cases/${caseId}/evidence`, {
        method: "POST",
        body: formData
      });

      toast.success("Evidence added successfully");
      setDescription("");
      setFiles([]);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to add evidence");
    } finally {
      setBusy(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files);
      if (selected.length > 5) {
        toast.error("Attach at most 5 evidence files at once");
        e.target.value = "";
        return;
      }
      const oversized = selected.find((file) => file.size > 20 * 1024 * 1024);
      if (oversized) {
        toast.error(`${oversized.name} exceeds the 20 MB limit`);
        e.target.value = "";
        return;
      }
      setFiles(selected);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[600px] bg-background border-hairline p-0 gap-0 overflow-hidden rounded-3xl">
        <div className="p-6 border-b border-hairline flex items-center justify-between">
          <DialogTitle className="text-xl font-medium">Add Evidence</DialogTitle>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex gap-2 p-1 bg-surface-2 rounded-xl overflow-x-auto custom-scrollbar">
            {TYPES.map(t => (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className={`flex-1 min-w-[80px] flex flex-col items-center justify-center gap-2 py-3 rounded-lg transition-colors ${
                  type === t.id 
                    ? "bg-muted text-foreground shadow-sm" 
                    : "text-muted-foreground hover:bg-surface-3"
                }`}
              >
                <t.icon className="w-5 h-5" />
                <span className="text-xs font-medium">{t.label}</span>
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <textarea 
              className="w-full bg-surface-2 border border-hairline rounded-lg px-3 py-2 text-sm min-h-[100px] focus:outline-none focus:ring-1 focus:ring-teal"
              placeholder="Describe the evidence in detail..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Files</label>
            <input 
              type="file" 
              multiple 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
            />
            <div className="flex items-center gap-4">
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()} type="button">
                Select Files
              </Button>
              <span className="text-xs text-muted-foreground">
                {files.length > 0 ? `${files.length} file(s) selected` : "No files selected"}
              </span>
            </div>
            {files.length > 0 && (
              <div className="mt-2 text-xs bg-surface-2 p-3 rounded-lg max-h-[100px] overflow-y-auto custom-scrollbar">
                <ul className="list-disc pl-4 space-y-1">
                  {files.map((f, i) => <li key={i}>{f.name}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-hairline flex justify-end gap-3 bg-surface-2/50">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Upload Evidence
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
