import { ShieldCheck, Wrench, FileText } from "lucide-react";

export function ExplainChips({ toolsUsed, sources }: { toolsUsed?: string[]; sources?: string[] }) {
  if ((!toolsUsed || toolsUsed.length === 0) && (!sources || sources.length === 0)) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1">
      <span className="inline-flex items-center gap-1 rounded-md bg-teal/10 px-2 py-0.5 text-[10px] font-medium text-teal">
        <ShieldCheck className="h-2.5 w-2.5" />
        Grounded in records
      </span>
      {toolsUsed?.map((tool) => (
        <span key={tool} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
          <Wrench className="h-2.5 w-2.5" />
          {tool}
        </span>
      ))}
      {sources?.map((fir) => (
        <span key={fir} className="inline-flex items-center gap-1 rounded-md bg-amber/10 px-2 py-0.5 text-[10px] font-mono text-amber">
          <FileText className="h-2.5 w-2.5" />
          {fir}
        </span>
      ))}
    </div>
  );
}
