import { useState, useEffect, useRef, useMemo } from "react";
import { apiFetchResponse, apiRequest } from "@/api/client";
import { Card, Button, Badge, SectionLabel } from "@/components/scrb/primitives";
import { Loader2, Plus, Mic, MicOff, Save, X, Paperclip, Pencil, Trash2, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { HighlightText } from "@/components/scrb/HighlightText";

const DIARY_TIME_ZONE = "Asia/Kolkata";

function formatDiaryDate(diaryDate: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: DIARY_TIME_ZONE,
  }).format(new Date(`${diaryDate}T00:00:00+05:30`));
}

function formatDiaryTime(timestamp: string) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: DIARY_TIME_ZONE,
  }).format(new Date(timestamp));
}

async function downloadDiaryDocument(caseId: string, file: { id: string; name: string }) {
  const response = await apiFetchResponse(
    `/api/cases/${caseId}/diary/documents/${file.id}/content?download=true`,
  );
  const blobUrl = window.URL.createObjectURL(await response.blob());
  const anchor = window.document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = file.name;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(blobUrl);
}

export function CaseDiaryTab({ caseId, canEdit }: { caseId: string; canEdit: boolean }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");

  const maxLocalDate = useMemo(() => {
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    return new Date(Date.now() - tzoffset).toISOString().slice(0, 10);
  }, []);

  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm("Are you sure you want to delete this diary entry? This action cannot be undone.")) return;
    try {
      await apiRequest(`/api/cases/${caseId}/diary/${entryId}`, { method: "DELETE" });
      toast.success("Diary entry deleted");
      loadDiary();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete entry");
    }
  };
  const [searchParams] = useSearchParams();
  const highlight = searchParams.get("highlight");

  useEffect(() => {
    loadDiary();
  }, [caseId]);

  const handleExportPDF = async () => {
    if (exportStartDate && exportEndDate && exportStartDate > exportEndDate) {
      toast.error("From date must be on or before the To date");
      return;
    }
    try {
      let url = `/api/cases/${caseId}/diary/export`;
      const queryParams = new URLSearchParams();
      if (exportStartDate) queryParams.append("start_date", exportStartDate);
      if (exportEndDate) queryParams.append("end_date", exportEndDate);
      if (queryParams.toString()) {
        url += `?${queryParams.toString()}`;
      }
      
      const res = await apiFetchResponse(url);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `CaseDiary_${caseId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      a.remove();
      setExportModalOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to export PDF");
    }
  };

  const groupedEntries = useMemo(() => {
    if (!data?.entries) return [];

    const groups = new Map<string, any[]>();
    for (const entry of data.entries) {
      // The API supplies this Karnataka calendar date, keeping pages stable
      // even when a timestamp falls on a different UTC day.
      const diaryDate = entry.diaryDate || entry.timestamp.slice(0, 10);
      const entries = groups.get(diaryDate) || [];
      entries.push(entry);
      groups.set(diaryDate, entries);
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([diaryDate, entries]) => ({
        diaryDate,
        entries: [...entries].sort(
          (a, b) => (a.dailyPageNumber ?? a.pageNumber) - (b.dailyPageNumber ?? b.pageNumber)
        ),
      }));
  }, [data?.entries]);

  const loadDiary = async () => {
    try {
      const res = await apiRequest(`/api/cases/${caseId}/diary`);
      setData(res);
    } catch (e: any) {
      toast.error(e.message || "Failed to load case diary");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="glass rounded-3xl p-5 flex items-center justify-between">
        <div>
          <SectionLabel>Case Diary Header</SectionLabel>
          <div className="flex items-center gap-4 mt-2">
            <div>
              <p className="text-xs text-muted-foreground">Current IO</p>
              <p className="text-sm font-medium">
                {data.currentIo ? `${data.currentIo.name} (${data.currentIo.badgeId})` : "Unassigned"}
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setExportModalOpen(true)}>
            <Download className="w-4 h-4 mr-2" /> Export to PDF
          </Button>
          {canEdit && (
            <Button variant="primary" onClick={() => setIsAdding(true)}>
              <Plus className="w-4 h-4 mr-2" /> Add Entry
            </Button>
          )}
        </div>
      </div>

      {isAdding && (
        <AddEntryForm 
          caseId={caseId} 
          onCancel={() => setIsAdding(false)} 
          onSuccess={() => {
            setIsAdding(false);
            loadDiary();
          }} 
        />
      )}

      {data.entries.length === 0 ? (
        <div className="glass rounded-3xl p-8 text-center text-muted-foreground text-sm">
          No case diary entries yet.
        </div>
      ) : (
        <div className="space-y-8">
          {groupedEntries.map(group => (
            <div key={group.diaryDate} className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground pl-2">
                {formatDiaryDate(group.diaryDate)}
                <span className="ml-2 text-xs font-normal">· {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}</span>
              </h3>
              {group.entries.map((entry: any) => {
                if (editingEntryId === entry.id) {
                  return (
                    <Card key={entry.id} className="p-5">
                      <AddEntryForm 
                        caseId={caseId} 
                        initialData={entry}
                        onCancel={() => setEditingEntryId(null)}
                        onSuccess={() => {
                          setEditingEntryId(null);
                          loadDiary();
                        }}
                      />
                    </Card>
                  );
                }
                return (
                  <Card key={entry.id} className="p-5 border-l-4 border-l-teal/50">
                    <div className="flex items-start justify-between border-b border-hairline pb-3 mb-3">
                      <div>
                        <div className="flex gap-2 items-center mb-2">
                          <Badge tone="teal">Page {entry.dailyPageNumber ?? entry.pageNumber}</Badge>
                          <span className="text-xs font-medium text-muted-foreground">{formatDiaryTime(entry.timestamp)}</span>
                        </div>
                        <p className="text-sm font-medium"><HighlightText text={entry.activityType} query={highlight} /></p>
                        <p className="text-xs text-muted-foreground mt-1">
                          By {entry.author_name} ({entry.author_badge})
                        </p>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditingEntryId(entry.id)}
                            className="p-1.5 text-muted-foreground hover:text-teal hover:bg-surface-3 rounded-md transition-colors"
                            title="Edit Entry"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteEntry(entry.id)}
                            className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-surface-3 rounded-md transition-colors"
                            title="Delete Entry"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed mb-3">
                      <HighlightText text={entry.narrative} query={highlight} />
                    </div>
                    {entry.documents?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-hairline/50">
                        <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1"><Paperclip className="w-3 h-3"/> Attached Documents</p>
                        <div className="flex flex-wrap gap-2">
                          {entry.documents.map((doc: any) => (
                            <button
                              key={doc.id}
                              type="button"
                              onClick={() => void downloadDiaryDocument(caseId, doc).catch((error) => toast.error(error?.message || "Failed to download document"))}
                              className="rounded-full focus:outline-none focus:ring-2 focus:ring-teal/40"
                              title={`Download ${doc.name}`}
                            >
                              <Badge tone="muted" className="cursor-pointer hover:bg-surface-3">
                                <Download className="mr-1 h-3 w-3" /> {doc.name}
                              </Badge>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
        <DialogContent className="sm:max-w-[425px] bg-background border-hairline p-6 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-medium">Export Case Diary</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Entries are exported oldest to newest. Page numbering restarts at Page 1 for every diary date.
            </p>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-muted-foreground">From Date (Optional)</label>
              <input 
                type="date"
                className="w-full bg-surface-2 border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal"
                value={exportStartDate}
                max={maxLocalDate}
                onChange={(e) => setExportStartDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-muted-foreground">To Date (Optional)</label>
              <input 
                type="date"
                className="w-full bg-surface-2 border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal"
                value={exportEndDate}
                max={maxLocalDate}
                onChange={(e) => setExportEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => setExportModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleExportPDF}>
              <Download className="w-4 h-4 mr-2" /> Download PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddEntryForm({ caseId, initialData, onCancel, onSuccess }: { caseId: string; initialData?: any; onCancel: () => void; onSuccess: () => void }) {
  const [activityType, setActivityType] = useState(initialData?.activityType || "Investigation");
  const [narrative, setNarrative] = useState(initialData?.narrative || "");
  const maxLocalTime = useMemo(() => {
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    return new Date(Date.now() - tzoffset).toISOString().slice(0, 16);
  }, []);

  const [timestamp, setTimestamp] = useState(() => {
    if (initialData?.timestamp) {
      const d = new Date(initialData.timestamp);
      const tzoffset = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - tzoffset).toISOString().slice(0, 16);
    }
    const tzoffset = (new Date()).getTimezoneOffset() * 60000; // offset in milliseconds
    const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, -1);
    return localISOTime.slice(0, 16);
  });
  const [isRecording, setIsRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState<any[]>([]);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition not supported in this browser");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";

    recognition.onresult = (event: any) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      if (finalTranscript) {
        setNarrative(prev => prev + (prev ? " " : "") + finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error(event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const data = await apiRequest(`/api/cases/${caseId}/diary/documents`, {
        method: "POST",
        body: formData,
      });

      setDocuments(prev => [...prev, { id: data.documentId, name: data.name }]);
      toast.success("Document uploaded");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload document");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeUploadedDocument = async (documentId: string) => {
    try {
      await apiRequest(`/api/cases/${caseId}/diary/documents/${documentId}`, { method: "DELETE" });
      setDocuments((current) => current.filter((item) => item.id !== documentId));
    } catch (error: any) {
      toast.error(error?.message || "Failed to remove document");
    }
  };

  const cancelEntry = async () => {
    if (documents.length > 0) {
      await Promise.allSettled(
        documents.map((item) => apiRequest(`/api/cases/${caseId}/diary/documents/${item.id}`, { method: "DELETE" })),
      );
    }
    onCancel();
  };

  const handleSave = async () => {
    if (!narrative.trim()) {
      toast.error("Narrative cannot be empty");
      return;
    }
    setBusy(true);
    try {
      const endpoint = initialData ? `/api/cases/${caseId}/diary/${initialData.id}` : `/api/cases/${caseId}/diary`;
      const method = initialData ? "PUT" : "POST";
      
      await apiRequest(endpoint, {
        method,
        body: JSON.stringify({
          activityType,
          narrative,
          linkedEvidenceIds: [],
          linkedPersonIds: [],
          documentIds: documents.map(d => d.id),
          timestamp: new Date(timestamp).toISOString()
        })
      });
      toast.success(initialData ? "Diary entry updated" : "Diary entry saved");
      onSuccess();
    } catch (e: any) {
      toast.error(e.message || "Failed to save entry");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5 border-amber/30 shadow-lg">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-medium text-lg">{initialData ? "Edit Diary Entry" : "New Diary Entry"}</h3>
        <button
          type="button"
          onClick={() => void cancelEntry()}
          disabled={busy || uploading}
          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Activity Type</label>
          <select 
            className="w-full bg-surface-2 border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal"
            value={activityType}
            onChange={(e) => setActivityType(e.target.value)}
          >
            <option>Investigation</option>
            <option>Site Visit</option>
            <option>Interrogation</option>
            <option>Evidence Collection</option>
            <option>Court Appearance</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Date & Time of Activity</label>
          <input 
            type="datetime-local"
            className="w-full bg-surface-2 border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal"
            value={timestamp}
            max={maxLocalTime}
            onChange={(e) => setTimestamp(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block flex justify-between">
            <span>Narrative</span>
          </label>
          <textarea 
            className="w-full bg-surface-2 border border-hairline rounded-lg px-3 py-2 text-sm min-h-[120px] focus:outline-none focus:ring-1 focus:ring-teal"
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            placeholder="Write details of the investigation activity..."
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Attachments</label>
          <div className="flex items-center gap-2 mb-2">
            <input 
              type="file" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
            />
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Paperclip className="w-4 h-4 mr-2" />}
              Attach Document
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={isRecording ? stopRecording : startRecording}
              className={isRecording ? "border-red-500 text-red-500 hover:bg-red-500/10" : ""}
            >
              {isRecording ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
              {isRecording ? "Stop Recording" : "Record Dictation"}
            </Button>
          </div>
          {documents.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {documents.map((doc) => (
                <Badge key={doc.id} tone="muted" className="flex items-center gap-1">
                  {doc.name}
                  <button onClick={() => void removeUploadedDocument(doc.id)} className="ml-1 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => void cancelEntry()} disabled={busy || uploading}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={busy || uploading}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Entry
          </Button>
        </div>
      </div>
    </Card>
  );
}
