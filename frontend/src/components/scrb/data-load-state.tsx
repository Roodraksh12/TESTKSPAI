import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button, Card } from "@/components/scrb/primitives";

type DataLoadErrorProps = {
  message?: string;
  onRetry: () => void;
  showingStaleData?: boolean;
};

export function DataLoadError({
  message = "This information could not be loaded.",
  onRetry,
  showingStaleData = false,
}: DataLoadErrorProps) {
  return (
    <Card accent="danger" className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <div>
          <p className="text-sm font-medium text-foreground">{message}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {showingStaleData
              ? "The last successful results are still shown below."
              : "Check the connection and try again."}
          </p>
        </div>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5" /> Retry
      </Button>
    </Card>
  );
}
