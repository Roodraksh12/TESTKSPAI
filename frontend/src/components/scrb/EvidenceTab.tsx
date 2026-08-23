import { useState, useEffect } from "react";
import { apiRequest } from "@/api/client";
import { Card, Badge, SectionLabel } from "@/components/scrb/primitives";
import { Loader2, Camera, Video, Mic, FlaskConical, FileText, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { HighlightText } from "@/components/scrb/HighlightText";
const TYPE_ICONS: Record<string, any> = {
  PHOTO: Camera,
  VIDEO: Video,
  VOICE: Mic,
  FORENSIC: FlaskConical,
  MISC: FileText,
};

export function EvidenceTab({ caseId }: { caseId: string }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const highlight = searchParams.get("highlight");

  useEffect(() => {
    loadEvidence();
  }, [caseId]);

  const loadEvidence = async () => {
    try {
      const res = await apiRequest(`/api/cases/${caseId}/evidence`);
      setData(res.evidence || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load evidence");
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

  if (data.length === 0) {
    return (
      <div className="glass rounded-3xl p-8 text-center text-muted-foreground text-sm">
        No evidence added to the registry yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.map((ev) => {
        const Icon = TYPE_ICONS[ev.type] || FileText;
        return (
          <Card key={ev.id} className="p-5 flex gap-4">
            <div className="h-12 w-12 rounded-2xl bg-surface-2 flex items-center justify-center shrink-0">
              <Icon className="w-6 h-6 text-teal" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{ev.type}</span>
                  <Badge tone={ev.status === "ACTIVE" ? "teal" : "muted"}>{ev.status}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(ev.timestamp).toLocaleString()}
                </span>
              </div>
              <p className="text-sm mt-2 text-foreground whitespace-pre-wrap">
                <HighlightText text={ev.description} query={highlight} />
              </p>
              
              {ev.documents?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-hairline/50">
                  <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-2">
                    <Paperclip className="w-3 h-3" /> Attachments
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ev.documents.map((doc: any) => (
                      <Badge key={doc.id} tone="muted">{doc.name}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {ev.diary_entries?.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Linked Diary Entries</p>
                  <div className="flex flex-wrap gap-2">
                    {ev.diary_entries.map((de: any) => (
                      <Badge key={de.id} tone="amber">Page {de.pageNumber} ({de.activityType})</Badge>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground mt-4">
                Added by {ev.added_by_name} ({ev.added_by_badge})
              </p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
