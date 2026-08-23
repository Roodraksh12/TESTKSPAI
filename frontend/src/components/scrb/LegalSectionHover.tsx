import { useState } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Badge } from "@/components/scrb/primitives";
import { Loader2, Scale, ListTodo, AlertCircle } from "lucide-react";
import { apiRequest } from "@/api/client";

export function LegalSectionHover({ 
  section, 
  caseId,
  children
}: { 
  section: string; 
  caseId?: string;
  children: React.ReactNode;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchDetails = async () => {
    if (data || loading) return;
    setLoading(true);
    setError(false);
    try {
      const url = caseId 
        ? `/api/legal/bns/${encodeURIComponent(section)}?case_id=${caseId}`
        : `/api/legal/bns/${encodeURIComponent(section)}`;
      const res = await apiRequest(url);
      setData(res);
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <HoverCard onOpenChange={(open) => open && fetchDetails()}>
      <HoverCardTrigger asChild>
        <span className="cursor-help underline decoration-dotted decoration-teal/50 hover:bg-teal/10 rounded px-1 -mx-1 transition-colors">
          {children}
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 p-0 bg-background border-hairline overflow-hidden rounded-xl shadow-xl" align="start">
        {loading ? (
          <div className="p-6 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : error || !data ? (
          <div className="p-4 flex flex-col items-center text-center gap-2 text-muted-foreground">
            <AlertCircle className="w-5 h-5 text-amber-500" />
            <p className="text-sm">Could not load legal details for {section}</p>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="p-4 bg-surface-2 border-b border-hairline">
              <div className="flex items-center gap-2 mb-1">
                <Scale className="w-4 h-4 text-teal" />
                <h4 className="font-semibold text-sm">{data.section}</h4>
              </div>
              <p className="text-xs font-medium text-foreground">{data.title}</p>
              <div className="flex gap-2 mt-3">
                <Badge tone={data.cognizable ? "amber" : "muted"}>
                  {data.cognizable ? "Cognizable" : "Non-Cognizable"}
                </Badge>
                <Badge tone={data.bailable ? "teal" : "amber"}>
                  {data.bailable ? "Bailable" : "Non-Bailable"}
                </Badge>
              </div>
            </div>
            
            <div className="p-4 space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar">
              <div>
                <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">Punishment</p>
                <p className="text-xs text-foreground">{data.punishment}</p>
              </div>
              
              {data.relevance && (
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">Why this applies here</p>
                  <p className="text-xs text-foreground leading-relaxed">{data.relevance}</p>
                </div>
              )}

              {data.actionPlan && (
                <div className="bg-teal/5 p-3 rounded-lg border border-teal/10">
                  <div className="flex items-center gap-1.5 mb-2">
                    <ListTodo className="w-3.5 h-3.5 text-teal" />
                    <p className="text-xs font-semibold text-teal-600 dark:text-teal-400">Action Plan</p>
                  </div>
                  <ul className="text-xs space-y-1.5 list-disc pl-3 text-foreground/80">
                    {Array.isArray(data.actionPlan) ? (
                      data.actionPlan.map((item: string, i: number) => <li key={i}>{item}</li>)
                    ) : (
                      <p>{data.actionPlan}</p>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
