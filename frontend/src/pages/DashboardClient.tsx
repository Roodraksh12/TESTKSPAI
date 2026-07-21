"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Paperclip, Mic, Sparkles, ShieldCheck, ClipboardList, ExternalLink, TrendingUp, AlertTriangle, Activity, Briefcase, ChevronRight, FileText, MapPin, Volume2, VolumeX, FileDown, History, Plus, ShieldAlert, GitMerge, Clock, Copy, Edit2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { useCopilotStore, type ChatMessage } from "@/lib/store";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "@/api/client";
import { Badge, IconOrb, StatCard } from "@/components/scrb/primitives";
import { ExplainChips } from "@/components/scrb/explain-chips";
import { useSpeech } from "@/lib/scrb/use-speech";

const VoiceEqualizer = ({ isListening }: { isListening: boolean }) => {
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  
  useEffect(() => {
    if (!isListening) return;
    
    let audioContext: AudioContext;
    let analyzer: AnalyserNode;
    let stream: MediaStream;
    let animationFrame: number;
    
    async function init() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyzer = audioContext.createAnalyser();
        analyzer.fftSize = 64;
        const microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyzer);
        const dataArray = new Uint8Array(analyzer.frequencyBinCount);
        
        const update = () => {
          analyzer.getByteFrequencyData(dataArray);
          
          if (barsRef.current) {
            for (let i = 0; i < 5; i++) {
              const el = barsRef.current[i];
              if (el) {
                // sample different frequency bands for each bar (avoid DC offset at bin 0)
                const value = dataArray[i * 3 + 2]; 
                // value is 0-255. map to 4px - 24px
                const height = 4 + (value / 255) * 20;
                el.style.height = `${height}px`;
              }
            }
          }
          animationFrame = requestAnimationFrame(update);
        };
        update();
      } catch(e) {
        console.error("Audio API error:", e);
      }
    }
    
    init();
    
    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (audioContext) audioContext.close();
    };
  }, [isListening]);

  return (
    <div className="flex items-center gap-[3px] h-6 items-end pb-1">
      {[0, 1, 2, 3, 4].map((i) => (
        <div 
          key={i} 
          ref={el => barsRef.current[i] = el}
          className="w-[3px] bg-teal rounded-full"
          style={{ height: '4px', transition: 'height 0.05s ease-out' }}
        />
      ))}
    </div>
  );
};
import { exportChatPdf } from "@/lib/scrb/chat-pdf";
import { ChatHistoryPanel } from "@/components/scrb/chat-history";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

const DEFAULT_SUGGESTIONS = [
  "Which cases risk default bail this month?",
  "Brief me on open cases at my station",
  "What are the current hotspot alerts?",
];

const GREETING =
  "Namaskara. I am the **Investigation Copilot**.\n\nAfter you **upload and save an FIR**, I will automatically run an **intake brief**: identity leads, MO-similar cases, legal framing, 24h checklist, and draft notes.\n\nYou can also open any case dossier and ask me to *run intake on this case*.";

const STATUS_COLORS: Record<string, string> = {
  OPEN: "text-teal",
  UNDER_INVESTIGATION: "text-amber",
  CHARGESHEETED: "text-muted-foreground",
  CLOSED: "text-muted-foreground",
};

export type DashboardOfficer = {
  name: string;
  badgeId: string;
  role: string;
  stationName: string | null;
  districtName: string | null;
  scopeLabel: string;
};

export type DashboardAttention = {
  overdue: number;
  urgent: number;
  watch: number;
  pendingMatches: number;
  highRiskAlerts: number;
};

export function DashboardClient({
  totalCases,
  clearanceRate = 0,
  alertCount,
  openCases = 0,
  recentCases,
  officer,
  attention,
  statsLoading = false,
}: {
  totalCases: number;
  clearanceRate?: number;
  alertCount: number;
  openCases?: number;
  recentCases: { id: string; firNumber: string; crimeType: string; status: string; reportedDate: string }[];
  officer?: DashboardOfficer | null;
  attention?: DashboardAttention | null;
  statsLoading?: boolean;
}) {
  const {
    chatHistory,
    setChatHistory,
    pageContext,
    activeCaseId,
    intakeActionPrompts,
    setActiveCaseId,
    sessionId,
    setSessionId,
    startNewSession,
    loadSession,
  } = useCopilotStore();

  const { t, lang } = useI18n();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const [searchParams] = useSearchParams();
  const isIntake = searchParams.get("intake") === "1";

  const [messages, setMessages] = useState<ChatMessage[]>(
    chatHistory && chatHistory.length > 0 ? chatHistory : [{ role: "assistant", content: GREETING }]
  );

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const speech = useSpeech();

  useEffect(() => {
    if (chatHistory && chatHistory.length > 0) {
      setMessages(chatHistory);
    }
  }, [chatHistory]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.onresult = (event: any) => { 
        const transcript = event.results[0][0].transcript;
        setInput(prev => (prev ? prev + " " : "") + transcript); 
      };
      recognitionRef.current.onerror = (event: any) => { 
        setIsListening(false); 
        if (event.error === 'not-allowed') {
          toast.error("Microphone access denied. Please allow microphone permissions in your browser.");
        } else if (event.error !== 'no-speech') {
          toast.error(`Voice error: ${event.error}`);
        }
      };
      recognitionRef.current.onend = () => { setIsListening(false); };
    }
  }, []);

  const toggleListen = () => {
    if (isListening) { recognitionRef.current?.stop(); return; }
    if (!recognitionRef.current) {
      toast.error("Voice recognition is not supported in this browser. Try Google Chrome or Microsoft Edge.");
      return;
    }
    try {
      recognitionRef.current.lang = lang === "KN" ? "kn-IN" : "en-IN";
      recognitionRef.current.start();
      setIsListening(true);
    } catch { 
      setIsListening(false); 
      toast.error("Could not start microphone.");
    }
  };

  const handleSend = async (customMessage?: string) => {
    const textToSend = customMessage || input;
    if (!textToSend?.trim() || isLoading) return;
    setInput("");
    const userMessage = textToSend.trim();
    const updatedMessages = [...messages, { role: "user", content: userMessage }] as ChatMessage[];
    setMessages(updatedMessages);
    setChatHistory(updatedMessages);
    setIsLoading(true);
    try {
      const data = await apiRequest("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: userMessage, pageContext, activeCaseId, sessionId, history: messages.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const finalMessages = [
        ...updatedMessages,
        { role: "assistant", content: data.reply, toolsUsed: data.toolsUsed, sources: data.sources } as ChatMessage,
      ];
      setMessages(finalMessages);
      setChatHistory(finalMessages);
      // The server creates the thread on first message; adopt its id so the rest
      // of the conversation lands in the same session.
      if (data.sessionId && data.sessionId !== sessionId) setSessionId(data.sessionId);
      setHistoryRefreshKey((k) => k + 1);
    } catch {
      setMessages([...updatedMessages, { role: "assistant", content: "Sorry, I encountered an error. Please try again." }]);
    } finally { setIsLoading(false); }
  };

  const handleNewChat = () => {
    startNewSession();
    setMessages([{ role: "assistant", content: GREETING }]);
    setInput("");
  };

  const handleLoadSession = (loadedId: string, loaded: ChatMessage[]) => {
    loadSession(loadedId, loaded);
    setMessages(loaded.length > 0 ? loaded : [{ role: "assistant", content: GREETING }]);
  };

  const chips = intakeActionPrompts.length > 0
    ? intakeActionPrompts
    : activeCaseId
      ? ["Run full intake on this case", "Show MO-similar cases", "Give me the 24–72h checklist", "Draft SP progress note"]
      : DEFAULT_SUGGESTIONS;

  const showChips = messages.length <= 2 || isIntake;

  const hasHighAlerts = alertCount > 0;

  return (
    <div className="flex h-full gap-5">
      {/* Main: Chatbot Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Alert banner */}
        {hasHighAlerts && (
          <Link
            to="/hotspots"
            className="flex items-center gap-2 mb-4 rounded-2xl border border-amber/20 bg-amber/[0.08] px-4 py-2.5 text-sm text-amber hover:bg-amber/[0.12] transition-colors"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{alertCount} high-risk alert{alertCount > 1 ? "s" : ""} active in your jurisdiction</span>
            <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
          </Link>
        )}

        {/* Chat card */}
        <div className="flex flex-col bg-surface rounded-2xl shadow-sm border border-hairline overflow-hidden flex-1 relative">
          <ChatHistoryPanel
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
            currentSessionId={sessionId}
            refreshKey={historyRefreshKey}
            onNewChat={handleNewChat}
            onLoadSession={handleLoadSession}
          />
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-hairline shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal/10 text-teal">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground">{t("copilot.title")}</h2>
                <p className="text-[9px] font-medium text-muted-foreground tracking-[0.15em] uppercase">
                  {t("copilot.subtitle")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {activeCaseId && (
                <Link
                  to={`/cases/${activeCaseId}`}
                  className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-amber/10 px-3 py-1.5 text-[11px] font-medium text-amber border border-amber/15 hover:bg-amber/15"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  {t("copilot.activeCase")}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                title="Past conversations"
                className="inline-flex items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-muted-foreground border border-hairline hover:text-foreground"
              >
                <History className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("copilot.history")}</span>
              </button>
              <button
                type="button"
                onClick={handleNewChat}
                title="Start a new conversation"
                className="inline-flex items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-muted-foreground border border-hairline hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("copilot.new")}</span>
              </button>
              <button
                type="button"
                disabled={exportingPdf || messages.length === 0}
                onClick={async () => {
                  setExportingPdf(true);
                  try {
                    await exportChatPdf(messages, activeCaseId);
                  } finally {
                    setExportingPdf(false);
                  }
                }}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-muted-foreground border border-hairline hover:text-foreground disabled:opacity-50"
              >
                <FileDown className="h-3.5 w-3.5" />
                {exportingPdf ? t("copilot.exporting") : t("copilot.exportPdf")}
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-5 bg-background pb-36">
            <div className="flex flex-col space-y-5">
              <AnimatePresence initial={false}>
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn("flex w-full", msg.role === "user" ? "justify-end" : "justify-start")}
                  >
                    <div className={cn("flex gap-3 max-w-[88%]", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                      {msg.role === "assistant" && (
                        <div className="shrink-0 mt-1">
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal/10 text-teal border border-teal/15">
                            <Sparkles className="h-4 w-4" />
                          </div>
                        </div>
                      )}
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <div className={cn(
                          "px-4 py-3 text-sm leading-relaxed max-w-none border",
                          msg.role === "user"
                            ? "bg-ink text-white rounded-2xl rounded-tr-sm border-transparent"
                            : "bg-surface-2 border-hairline text-foreground rounded-2xl rounded-tl-sm prose prose-sm dark:prose-invert max-w-none"
                        )}>
                          {msg.role === "user" ? msg.content : <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>}
                        </div>
                        {msg.role === "assistant" && (msg.kind === "intake" || (isIntake && i === 0)) && (
                          <div className="flex flex-wrap items-center gap-2 px-1">
                            <span className="px-2 py-0.5 rounded-md bg-teal/10 text-teal text-[10px] font-medium">Post-upload intake</span>
                            <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-mono">Leads only · Confirm before filing</span>
                          </div>
                        )}
                        {msg.role === "assistant" && (msg.toolsUsed?.length || msg.sources?.length) ? (
                          <ExplainChips toolsUsed={msg.toolsUsed} sources={msg.sources} />
                        ) : null}
                        {msg.role === "assistant" && speech.isSupported && msg.content && (
                          <button
                            type="button"
                            onClick={() => speech.toggle(`msg-${i}`, msg.content)}
                            className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shadow-sm"
                          >
                            {speech.speakingId === `msg-${i}` ? (
                              <>
                                <VolumeX className="h-3.5 w-3.5" /> Stop Reading
                              </>
                            ) : (
                              <>
                                <Volume2 className="h-3.5 w-3.5" /> Read Aloud
                              </>
                            )}
                          </button>
                        )}
                        <div className={cn("flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity", msg.role === "user" ? "justify-end" : "justify-start")}>
                          <button
                            type="button"
                            onClick={() => { navigator.clipboard.writeText(msg.content); toast.success("Copied to clipboard"); }}
                            className="p-1 rounded-md border border-hairline hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Copy text"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          {msg.role === "user" && (
                            <button
                              type="button"
                              onClick={() => { setInput(msg.content); inputRef.current?.focus(); }}
                              className="p-1 rounded-md border border-hairline hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title="Edit text"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {isLoading && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
                  <div className="flex gap-3 max-w-[85%]">
                    <div className="shrink-0 mt-1">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal/10 text-teal border border-teal/15">
                        <Sparkles className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="bg-surface-2 border border-hairline rounded-2xl rounded-tl-sm px-4 py-3 flex items-center">
                      <div className="flex gap-1.5 items-center">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            animate={{ y: [0, -4, 0] }}
                            transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2, ease: "easeInOut" }}
                            className="h-1.5 w-1.5 bg-muted-foreground rounded-full"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          {/* Input */}
          <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background to-transparent pointer-events-none" />
            <div className="relative z-10">
              {showChips && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {chips.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSend(s)}
                      className="rounded-full border border-hairline bg-surface px-3.5 py-1.5 text-[12px] text-muted-foreground transition-all hover:bg-surface-2 hover:text-foreground shadow-sm"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <form
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                className="flex items-center gap-2 bg-surface p-1.5 rounded-2xl border border-hairline transition-all duration-200 focus-within:border-foreground/30 focus-within:ring-4 focus-within:ring-muted shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => document.getElementById("scrb-file-upload")?.click()}
                  className="shrink-0 text-muted-foreground hover:text-foreground h-10 w-10 flex items-center justify-center rounded-xl transition-colors"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <input type="file" id="scrb-file-upload" className="hidden"
                  onChange={(e) => { const files = e.target.files; if (files?.[0]) setInput((prev) => (prev ? prev + " " : "") + `[Attached: ${files[0].name}] `); }}
                />
                {isListening ? (
                  <div className="flex-1 flex items-center gap-3 px-2">
                    <span className="text-sm font-medium text-teal animate-pulse">Listening...</span>
                    <VoiceEqualizer isListening={isListening} />
                  </div>
                ) : (
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={activeCaseId ? t("copilot.askCasePlaceholder") : t("copilot.askPlaceholder")}
                    className="flex-1 bg-transparent border-none shadow-none focus:outline-none text-sm text-foreground placeholder:text-muted-foreground"
                  />
                )}
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={toggleListen}
                    className={cn("h-10 w-10 flex items-center justify-center rounded-xl transition-colors", isListening ? "text-teal bg-teal/10" : "text-muted-foreground hover:text-foreground")}
                  >
                    <Mic className={cn("h-4 w-4", isListening && "animate-pulse")} />
                  </button>
                  <button type="submit" disabled={isLoading || !input?.trim()}
                    className="bg-ink text-white dark:bg-foreground dark:text-background h-10 w-10 flex items-center justify-center rounded-xl disabled:opacity-40 transition-all hover:bg-ink-2 shadow-sm"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Dashboard Panel */}
      <div className="hidden xl:flex flex-col w-72 shrink-0 gap-4 overflow-y-auto">
        {/* Who is signed in, and exactly what they can see. Making the RBAC
            scope explicit prevents the "why isn't that case here?" confusion. */}
        <OfficerCard officer={officer} loading={statsLoading} />

        {/* Anything with a clock or a pending decision attached. */}
        <AttentionCard attention={attention} loading={statsLoading} />

        {/* Stats — filled async; chat shell never waits */}
        <div className="space-y-3">
          <StatCard
            icon={Briefcase}
            label={t("dash.openInvestigations")}
            value={statsLoading ? "—" : openCases}
            tone="teal"
          />
          <StatCard
            icon={TrendingUp}
            label={t("dash.clearanceRate")}
            value={statsLoading ? "—" : `${clearanceRate}%`}
            tone="default"
          />
          <StatCard
            icon={Activity}
            label={t("dash.totalCases")}
            value={statsLoading ? "—" : totalCases}
            tone="default"
          />
        </div>

        {/* Recent Activity */}
        <div className="rounded-2xl border border-hairline bg-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{t("dash.recentCases")}</h3>
            <Link to="/cases" className="text-[10px] text-teal hover:text-teal/80 font-medium">{t("dash.viewAll")}</Link>
          </div>
          <div className="space-y-2">
            {statsLoading && recentCases.length === 0 ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-2" />
              ))
            ) : recentCases.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">{t("dash.noRecentCases")}</p>
            ) : null}
            {recentCases.map((c) => (
              <Link key={c.id} to={`/cases/${c.id}`}
                className="flex items-start gap-2.5 rounded-xl p-2.5 hover:bg-surface-2 transition-colors group"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-foreground truncate group-hover:text-ink transition-colors">{c.firNumber}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground truncate">{c.crimeType}</span>
                    <span className={cn("text-[9px] font-medium", STATUS_COLORS[c.status] || "text-muted-foreground")}>
                      {c.status.replace("_", " ")}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-2xl border border-hairline bg-surface p-4">
          <h3 className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase mb-3">{t("dash.quickActions")}</h3>
          <div className="space-y-1.5">
            <Link to="/fir/upload"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground hover:bg-surface-2 transition-colors"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber/10 text-amber">
                <FileText className="h-3.5 w-3.5" />
              </div>
              <span className="text-[12px] font-medium">{t("dash.newFirIntake")}</span>
            </Link>
            <Link to="/hotspots"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground hover:bg-surface-2 transition-colors"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal/10 text-teal">
                <MapPin className="h-3.5 w-3.5" />
              </div>
              <span className="text-[12px] font-medium">{t("dash.viewHotspots")}</span>
            </Link>
            <Link to="/network"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground hover:bg-surface-2 transition-colors"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
              </div>
              <span className="text-[12px] font-medium">{t("dash.entityNetwork")}</span>
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-hairline bg-surface p-4 text-center">
          <p className="text-[9px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">{t("dash.securedSession")}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">{t("dash.auditLogged")}</p>
        </div>
      </div>
    </div>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function OfficerCard({ officer, loading }: { officer?: DashboardOfficer | null; loading: boolean }) {
  const { t } = useI18n();
  if (loading && !officer) {
    return <div className="h-[104px] animate-pulse rounded-2xl bg-surface-2" />;
  }
  if (!officer) return null;

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink text-[13px] font-bold text-white dark:bg-foreground dark:text-background">
          {initialsOf(officer.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-foreground">{officer.name}</p>
          <p className="text-mono truncate text-[10px] text-muted-foreground">{officer.badgeId}</p>
        </div>
      </div>

      <div className="mt-3 space-y-1.5 border-t border-hairline pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">{t("dash.rank")}</span>
          <span className="truncate text-[11px] font-medium text-foreground">
            {t(`role.${officer.role}`) !== `role.${officer.role}` ? t(`role.${officer.role}`) : officer.role}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">{t("dash.station")}</span>
          <span className="truncate text-[11px] font-medium text-foreground">{officer.stationName || "—"}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">{t("dash.district")}</span>
          <span className="truncate text-[11px] font-medium text-foreground">{officer.districtName || "—"}</span>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-teal/[0.08] px-2.5 py-2">
        <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-teal" />
        <p className="text-[10px] leading-relaxed text-teal">
          {t("dash.dataVisible")}: <span className="font-medium">{officer.scopeLabel}</span>
        </p>
      </div>
    </div>
  );
}

function AttentionRow({
  icon: Icon,
  label,
  value,
  to,
  tone,
}: {
  icon: typeof Clock;
  label: string;
  value: number;
  to: string;
  tone: "danger" | "amber" | "muted";
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-surface-2"
    >
      <div
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
          tone === "danger" && "bg-danger/10 text-danger",
          tone === "amber" && "bg-amber/10 text-amber",
          tone === "muted" && "bg-surface-2 text-muted-foreground"
        )}
      >
        <Icon className="h-3 w-3" />
      </div>
      <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">{label}</span>
      <span
        className={cn(
          "text-[13px] font-bold tabular-nums",
          tone === "danger" && "text-danger",
          tone === "amber" && "text-amber",
          tone === "muted" && "text-muted-foreground"
        )}
      >
        {value}
      </span>
    </Link>
  );
}

function AttentionCard({ attention, loading }: { attention?: DashboardAttention | null; loading: boolean }) {
  const { t } = useI18n();
  if (loading && !attention) {
    return <div className="h-[140px] animate-pulse rounded-2xl bg-surface-2" />;
  }
  if (!attention) return null;

  const nothingPending =
    attention.overdue === 0 &&
    attention.urgent === 0 &&
    attention.pendingMatches === 0 &&
    attention.highRiskAlerts === 0;

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {t("dash.needsAttention")}
        </h3>
        {attention.overdue > 0 && (
          <span className="rounded-md bg-danger/10 px-1.5 py-0.5 text-[9px] font-bold text-danger uppercase">
            {t("dash.actionDue")}
          </span>
        )}
      </div>

      {nothingPending ? (
        <p className="py-2 text-[11px] text-muted-foreground">
          {t("dash.nothingPending")}
        </p>
      ) : (
        <div className="space-y-0.5">
          {attention.overdue > 0 && (
            <AttentionRow
              icon={ShieldAlert}
              label={t("dash.chargesheetLapsed")}
              value={attention.overdue}
              to="/deadlines"
              tone="danger"
            />
          )}
          {attention.urgent > 0 && (
            <AttentionRow
              icon={Clock}
              label={t("dash.dueWithin15")}
              value={attention.urgent}
              to="/deadlines"
              tone="amber"
            />
          )}
          {attention.pendingMatches > 0 && (
            <AttentionRow
              icon={GitMerge}
              label={t("dash.leadsAwaiting")}
              value={attention.pendingMatches}
              to="/cases"
              tone="amber"
            />
          )}
          {attention.highRiskAlerts > 0 && (
            <AttentionRow
              icon={AlertTriangle}
              label={t("dash.highRiskZones")}
              value={attention.highRiskAlerts}
              to="/hotspots"
              tone="muted"
            />
          )}
        </div>
      )}
    </div>
  );
}
