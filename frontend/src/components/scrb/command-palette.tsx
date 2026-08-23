"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { Search, FolderClosed, User, Sparkles, MapPin, Zap, BellRing, Scale } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "@/api/client";
import { Badge, IconOrb } from "./primitives";
import { cn } from "@/lib/utils";

export function OmniSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ cases: any[]; suspects: any[]; bns_sections: any[] }>({ cases: [], suspects: [], bns_sections: [] });
  const [loading, setLoading] = useState(false);
  const [activeValue, setActiveValue] = useState("");

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults({ cases: [], suspects: [], bns_sections: [] });
      return;
    }
  }, [open]);

  useEffect(() => {
    const fetchResults = async () => {
      if (!query.trim()) {
        setResults({ cases: [], suspects: [], bns_sections: [] });
        return;
      }
      setLoading(true);
      try {
        const data = await apiRequest(`/api/search?q=${encodeURIComponent(query)}`);
        setResults({ cases: data.cases || [], suspects: data.suspects || [], bns_sections: data.bns_sections || [] });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    const handler = setTimeout(fetchResults, 300);
    return () => clearTimeout(handler);
  }, [query]);

  // Find the currently active item to show in preview
  const activeCase = results.cases?.find(c => `case-${c.id}` === activeValue);
  const activeSuspect = results.suspects?.find(s => `suspect-${s.id}` === activeValue);
  const activeBns = results.bns_sections?.find(b => `bns-${b.bns}` === activeValue);
  const isActiveQuickAction = activeValue.startsWith("action-");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-ink/40 backdrop-blur-sm px-4">
      <div className="fixed inset-0" onClick={() => onOpenChange(false)} />
      
      <Command 
        className="relative flex flex-col w-full max-w-5xl h-[600px] max-h-[80vh] bg-surface rounded-2xl shadow-2xl border border-hairline overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        shouldFilter={false} // We handle filtering server-side via API
        onValueChange={setActiveValue}
      >
        <div className="flex items-center px-4 border-b border-hairline bg-surface">
          <Search className="w-6 h-6 text-muted-foreground shrink-0" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            className="flex-1 px-4 py-5 bg-transparent outline-none text-xl placeholder:text-muted-foreground"
            placeholder="Search cases, suspects, or type a command..."
            autoFocus
          />
          {loading && <div className="w-5 h-5 border-2 border-hairline border-t-ink rounded-full animate-spin shrink-0" />}
          <div className="hidden sm:flex items-center ml-2 space-x-1">
            <Badge className="px-1.5 py-0.5 text-[10px] uppercase tracking-widest bg-muted">ESC to close</Badge>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Left Pane: Results List */}
          <Command.List className="w-1/2 border-r border-hairline overflow-y-auto p-2 overscroll-contain">
            {!query && (
              <Command.Group heading="Quick Actions" className="px-2 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Command.Item 
                  value="action-upload-fir"
                  onSelect={() => { onOpenChange(false); navigate("/fir/upload"); }}
                  className="flex items-center gap-3 px-3 py-3 mt-1 rounded-lg cursor-pointer aria-selected:bg-ink aria-selected:text-white transition-colors"
                >
                  <FolderClosed className="w-4 h-4 opacity-70" />
                  <span className="font-medium text-sm">Upload New FIR</span>
                </Command.Item>
                <Command.Item 
                  value="action-hotspots"
                  onSelect={() => { onOpenChange(false); navigate("/hotspots"); }}
                  className="flex items-center gap-3 px-3 py-3 mt-1 rounded-lg cursor-pointer aria-selected:bg-ink aria-selected:text-white transition-colors"
                >
                  <MapPin className="w-4 h-4 opacity-70" />
                  <span className="font-medium text-sm">View Risk Hotspots</span>
                </Command.Item>
                <Command.Item
                  value="action-early-warnings"
                  onSelect={() => { onOpenChange(false); navigate("/early-warnings"); }}
                  className="flex items-center gap-3 px-3 py-3 mt-1 rounded-lg cursor-pointer aria-selected:bg-ink aria-selected:text-white transition-colors"
                >
                  <BellRing className="w-4 h-4 opacity-70" />
                  <span className="font-medium text-sm">View Early Warnings</span>
                </Command.Item>
              </Command.Group>
            )}

            {results.cases?.length > 0 && (
              <Command.Group heading="Case Files" className="px-2 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {results.cases.map(c => (
                  <Command.Item
                    key={c.id}
                    value={`case-${c.id}`}
                    onSelect={() => { 
                      onOpenChange(false); 
                      navigate(`/cases/${c.id}?highlight=${encodeURIComponent(query)}`); 
                    }}
                    className="flex items-center gap-3 px-3 py-3 mt-1 rounded-lg cursor-pointer aria-selected:bg-ink aria-selected:text-white transition-colors group"
                  >
                    <FolderClosed className="w-4 h-4 opacity-70" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-sm truncate">{c.firNumber || "Unknown FIR"}</span>
                      <span className="text-xs opacity-70 truncate">{c.crimeType}</span>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {results.suspects?.length > 0 && (
              <Command.Group heading="Persons of Interest" className="px-2 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {results.suspects.map(s => (
                  <Command.Item
                    key={s.id}
                    value={`suspect-${s.id}`}
                    onSelect={() => { 
                      onOpenChange(false); 
                      if (s.caseId) {
                        navigate(`/cases/${s.caseId}?highlight=${encodeURIComponent(s.name)}`);
                      } else {
                        navigate(`/network`); 
                      }
                    }}
                    className="flex items-center gap-3 px-3 py-3 mt-1 rounded-lg cursor-pointer aria-selected:bg-ink aria-selected:text-white transition-colors group"
                  >
                    <User className="w-4 h-4 opacity-70" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-sm truncate">{s.name}</span>
                      <span className="text-xs opacity-70 truncate">{s.role || "Suspect"}</span>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {results.bns_sections?.length > 0 && (
              <Command.Group heading="Legal Sections (BNS)" className="px-2 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {results.bns_sections.map(b => (
                  <Command.Item
                    key={b.bns}
                    value={`bns-${b.bns}`}
                    className="flex items-center gap-3 px-3 py-3 mt-1 rounded-lg cursor-pointer aria-selected:bg-ink aria-selected:text-white transition-colors group"
                  >
                    <Scale className="w-4 h-4 opacity-70" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-sm truncate">BNS {b.bns}</span>
                      <span className="text-xs opacity-70 truncate">{b.title}</span>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {query && !loading && results.cases?.length === 0 && results.suspects?.length === 0 && results.bns_sections?.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No results found for "{query}"
              </div>
            )}
          </Command.List>

          {/* Right Pane: Rich Preview */}
          <div className="hidden sm:block w-1/2 bg-surface-2 p-6 overflow-y-auto">
            {activeCase ? (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-start justify-between">
                  <IconOrb tone="amber" size="lg">
                    <FolderClosed className="w-6 h-6" />
                  </IconOrb>
                  <Badge tone={activeCase.status === 'Open' ? 'amber' : 'neutral'}>{activeCase.status}</Badge>
                </div>
                <div>
                  <h3 className="text-2xl font-bold font-display text-ink">{activeCase.firNumber}</h3>
                  <p className="text-sm font-medium text-amber-800 mt-1">{activeCase.crimeType} · {activeCase.station?.name || "Unknown Station"}</p>
                </div>
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Case Summary</h4>
                  <p className="text-sm leading-relaxed text-foreground bg-surface p-4 rounded-xl border border-hairline shadow-sm">
                    {activeCase.summary || "No summary available."}
                  </p>
                </div>
                <div className="bg-teal-50/50 p-4 rounded-xl border border-teal-200">
                   <div className="flex items-center gap-2 text-teal-800 mb-2">
                     <Sparkles className="w-4 h-4" />
                     <span className="font-semibold text-sm">AI Quick Action</span>
                   </div>
                   <p className="text-xs text-teal-900/80 mb-3">Press Enter to jump to this case and open the Copilot to analyze.</p>
                   <div className="h-2 bg-teal-100 rounded-full overflow-hidden">
                     <div className="w-1/3 h-full bg-teal-500 rounded-full animate-pulse"></div>
                   </div>
                </div>
              </div>
            ) : activeSuspect ? (
               <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                 <div className="flex items-center gap-4">
                   <div className="w-16 h-16 bg-ink rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-md">
                     {activeSuspect.name.charAt(0)}
                   </div>
                   <div>
                     <h3 className="text-2xl font-bold font-display text-ink">{activeSuspect.name}</h3>
                     <p className="text-sm text-muted-foreground">ID: {activeSuspect.identifiers || "Unknown"}</p>
                   </div>
                 </div>
                 <div className="space-y-2">
                   <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Contact & Info</h4>
                   <div className="bg-surface p-4 rounded-xl border border-hairline shadow-sm space-y-3 text-sm">
                     <div className="flex justify-between">
                       <span className="text-muted-foreground">Phone</span>
                       <span className="font-medium text-ink">{activeSuspect.phone || "Not recorded"}</span>
                     </div>
                     <div className="flex justify-between">
                       <span className="text-muted-foreground">Role</span>
                       <span className="font-medium text-ink">{activeSuspect.role || "Unknown"}</span>
                     </div>
                   </div>
                 </div>
                 <div className="space-y-2">
                   <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Linked Cases ({activeSuspect.casePersons?.length || 0})</h4>
                   <div className="space-y-2">
                     {activeSuspect.casePersons?.map((cp: any) => (
                       <div key={cp.id} className="bg-surface p-3 rounded-lg border border-hairline shadow-sm text-sm flex items-center gap-2">
                         <FolderClosed className="w-4 h-4 text-muted-foreground" />
                         <span className="font-medium">{cp.case?.firNumber || "Unknown Case"}</span>
                       </div>
                     ))}
                   </div>
                 </div>
               </div>
            ) : activeBns ? (
               <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                 <div className="flex items-center gap-4">
                   <div className="w-16 h-16 bg-teal/10 rounded-2xl flex items-center justify-center shadow-sm">
                     <Scale className="w-8 h-8 text-teal" />
                   </div>
                   <div>
                     <h3 className="text-2xl font-bold font-display text-ink">BNS {activeBns.bns}</h3>
                     <p className="text-sm font-medium text-teal-800">{activeBns.title}</p>
                   </div>
                 </div>
                 <div className="space-y-2">
                   <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Punishment & Details</h4>
                   <p className="text-sm leading-relaxed text-foreground bg-surface p-4 rounded-xl border border-hairline shadow-sm">
                     {activeBns.punishment || "No punishment details available."}
                   </p>
                 </div>
               </div>
            ) : isActiveQuickAction ? (
               <div className="flex flex-col items-center justify-center h-full text-center space-y-4 animate-in fade-in duration-300">
                 <div className="w-16 h-16 bg-surface border border-hairline shadow-sm rounded-2xl flex items-center justify-center">
                   <Zap className="w-8 h-8 text-amber-500" />
                 </div>
                 <div>
                   <h3 className="text-lg font-bold text-ink">Quick Action</h3>
                   <p className="text-sm text-muted-foreground max-w-[200px] mt-1">Press Enter to instantly execute this workflow.</p>
                 </div>
               </div>
            ) : (
               <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground space-y-4">
                 <Search className="w-12 h-12 opacity-20" />
                 <p className="text-sm max-w-[200px]">Search for any case, suspect, or location. Use arrow keys to preview.</p>
               </div>
            )}
          </div>
        </div>
      </Command>
    </div>
  );
}
