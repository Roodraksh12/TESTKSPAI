import { useEffect, useState } from "react";
import { Download, ExternalLink, FileSearch, LockKeyhole } from "lucide-react";

import { apiFetchResponse, apiRequest } from "@/api/client";
import { DataLoadError } from "@/components/scrb/data-load-state";
import { Badge, Button, Card, SectionLabel, Skeleton } from "@/components/scrb/primitives";

type FirDocument = {
  id: string;
  filename: string;
  contentType: "application/pdf" | "image/jpeg" | "image/png";
  sizeBytes: number;
  sha256: string;
  uploadedAt: string;
  uploadedByName?: string;
  uploadedByBadge?: string;
};

type FirDocumentMetadata = {
  storageReady: boolean;
  document: FirDocument | null;
  hasExtractedText: boolean;
};

function readableSize(bytes: number) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FirDocumentTab({ caseId }: { caseId: string }) {
  const [metadata, setMetadata] = useState<FirDocumentMetadata | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    let generatedUrl: string | null = null;

    async function load() {
      setLoading(true);
      setError("");
      setMetadata(null);
      setObjectUrl(null);
      try {
        const nextMetadata = await apiRequest(`/api/cases/${caseId}/fir-document`, {
          fresh: true,
        });
        if (!active) return;
        setMetadata(nextMetadata);

        if (nextMetadata.document) {
          const response = await apiFetchResponse(`/api/cases/${caseId}/fir-document/content`);
          const blob = await response.blob();
          if (!active) return;
          generatedUrl = URL.createObjectURL(blob);
          setObjectUrl(generatedUrl);
        }
      } catch (loadError: any) {
        if (active) setError(loadError?.message || "The original FIR could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
      if (generatedUrl) URL.revokeObjectURL(generatedUrl);
    };
  }, [caseId, reloadKey]);

  const downloadDocument = async () => {
    if (!metadata?.document) return;
    setDownloading(true);
    try {
      const response = await apiFetchResponse(
        `/api/cases/${caseId}/fir-document/content?download=true`,
      );
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = metadata.document.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError: any) {
      setError(downloadError?.message || "The FIR could not be downloaded.");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-[560px] rounded-3xl" />
      </div>
    );
  }

  if (error) {
    return (
      <DataLoadError
        message={error}
        onRetry={() => setReloadKey((value) => value + 1)}
      />
    );
  }

  if (!metadata?.storageReady) {
    return (
      <Card accent="amber" className="p-6">
        <SectionLabel>Original FIR</SectionLabel>
        <p className="mt-2 text-sm text-foreground">The protected FIR viewer has not been set up yet.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Existing case information is unchanged. An administrator must apply the FIR-document setup before scans can be retained.
        </p>
      </Card>
    );
  }

  if (!metadata.document) {
    return (
      <Card accent="amber" className="p-8 text-center">
        <FileSearch className="mx-auto h-8 w-8 text-muted-foreground" />
        <h3 className="mt-3 text-base font-semibold text-foreground">Original FIR not retained</h3>
        <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
          {metadata.hasExtractedText
            ? "This case was created before original-document retention was enabled. Its extracted OCR text is still available in Overview."
            : "No original FIR scan is attached to this case."}
        </p>
      </Card>
    );
  }

  const documentInfo = metadata.document;
  const uploadedAt = new Date(documentInfo.uploadedAt);

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-teal/10 p-2 text-teal">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <SectionLabel>Protected original FIR</SectionLabel>
            <p className="mt-1 truncate text-sm font-medium text-foreground">{documentInfo.filename}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>{readableSize(documentInfo.sizeBytes)}</span>
              <span>·</span>
              <span>{uploadedAt.toLocaleString()}</span>
              {documentInfo.uploadedByName && (
                <>
                  <span>·</span>
                  <span>
                    {documentInfo.uploadedByName}
                    {documentInfo.uploadedByBadge ? ` (${documentInfo.uploadedByBadge})` : ""}
                  </span>
                </>
              )}
              <Badge tone="teal">Access audited</Badge>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {objectUrl && (
            <Button type="button" variant="outline" size="sm" onClick={() => window.open(objectUrl, "_blank", "noopener,noreferrer")}>
              <ExternalLink className="h-3.5 w-3.5" /> Open full size
            </Button>
          )}
          <Button type="button" variant="secondary" size="sm" disabled={downloading} onClick={() => void downloadDocument()}>
            <Download className="h-3.5 w-3.5" /> {downloading ? "Preparing…" : "Download"}
          </Button>
        </div>
      </Card>

      <div className="overflow-hidden rounded-3xl border border-hairline bg-surface-2">
        {objectUrl && documentInfo.contentType === "application/pdf" && (
          <iframe
            src={objectUrl}
            title={`Original FIR: ${documentInfo.filename}`}
            className="h-[70vh] min-h-[560px] w-full bg-white"
          />
        )}
        {objectUrl && documentInfo.contentType !== "application/pdf" && (
          <div className="flex min-h-[480px] items-center justify-center p-4">
            <img
              src={objectUrl}
              alt={`Original FIR: ${documentInfo.filename}`}
              className="max-h-[75vh] max-w-full rounded-xl object-contain"
            />
          </div>
        )}
      </div>
    </div>
  );
}
