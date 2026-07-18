"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Paperclip, Mic, Sparkles, ChevronDown, ShieldCheck } from "lucide-react";
import { Button, Badge, IconOrb } from "./primitives";
import { SUGGESTIONS } from "@/lib/scrb/mock";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/api/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useLocation } from "react-router-dom";

export function CopilotSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pathname } = useLocation();
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "assistant",
      content: "Namaskara. I am the SCRB Investigation Copilot. I can see the page you are viewing. How can I assist you?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMessage = { id: `u-${Date.now()}`, role: "user", content: text.trim() };
    const history = [...messages, userMessage];
    setMessages(history);
    setInput("");
    setIsLoading(true);
    try {
      const data = await apiRequest("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: text.trim(),
          pageContext: pathname,
          history: messages.map((m: any) => ({ role: m.role, content: m.content })),
        }),
      });
      setMessages([...history, { id: `a-${Date.now()}`, role: "assistant", content: data.reply }]);
    } catch {
      setMessages([...history, { id: `e-${Date.now()}`, role: "assistant", content: "Sorry, I encountered an error." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const append = ({ role, content }: { role: string; content: string }) => {
    if (role === "user") sendMessage(content);
  };

  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, open]);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      
      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
      };
      
      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, [setInput]);

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      if (!recognitionRef.current) {
        alert("Speech recognition is not supported in this browser.");
        return;
      }
      try {
        const lang = localStorage.getItem("scrb_lang") === "KN" ? "kn-IN" : "en-IN";
        recognitionRef.current.lang = lang;
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error("Speech error", err);
        alert("Could not start microphone. Please check browser permissions.");
        setIsListening(false);
      }
    }
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div 
          className="fixed inset-0 z-40 bg-background/50 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}
      
      {/* Sliding Panel */}
      <div 
        className={cn(
          "fixed inset-y-0 right-0 z-50 w-full sm:w-[450px] border-l border-hairline bg-surface shadow-2xl transition-transform duration-300 ease-spring flex flex-col",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-hairline px-6 py-4">
          <IconOrb tone="teal">
            <Sparkles className="h-4 w-4" />
          </IconOrb>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold tracking-tight">Investigation Copilot</p>
            <p className="text-[10px] tracking-widest text-muted-foreground uppercase truncate">
              Context: {pathname === "/" ? "Dashboard" : pathname}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:bg-surface-2 rounded-full">
            <ChevronDown className="h-5 w-5 rotate-90" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          {messages.map((m: any) => <MessageBubble key={m.id} m={m} />)}
          {isLoading && messages[messages.length - 1]?.role === "user" && <TypingShimmer />}
          <div ref={endRef} />
        </div>

        {/* Suggestions */}
        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-2 px-6 pb-3">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.text}
                onClick={() => append({ role: "user", content: s.text })}
                className="rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs text-muted-foreground transition hover:-translate-y-0.5 hover:border-foreground/30 hover:text-foreground"
              >
                {s.text}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="border-t border-hairline p-4 bg-surface-2">
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-2 shadow-sm transition-colors focus-within:border-foreground/20"
          >
            <input 
              type="file" 
              id="scrb-file-upload" 
              className="hidden" 
              onChange={(e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                  setInput((prev: any) => (prev ? prev + " " : "") + `[Attached: ${files[0].name}] `);
                }
              }}
            />
            <button 
              type="button" 
              onClick={() => document.getElementById("scrb-file-upload")?.click()}
              className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground" 
              aria-label="Attach"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <input
              value={input}
              onChange={handleInputChange}
              placeholder="Ask about a FIR, entity, hotspot..."
              className="flex-1 bg-transparent px-2 py-2 text-[13px] placeholder:text-muted-foreground focus:outline-none"
            />
            <button 
              type="button" 
              onClick={toggleListen}
              className={cn("rounded-full p-2 transition-colors", isListening ? "bg-amber-500 text-white hover:bg-amber-600" : "text-muted-foreground hover:bg-muted hover:text-foreground")} 
              aria-label="Voice"
            >
              <Mic className={cn("h-4 w-4", isListening && "animate-pulse")} />
            </button>
            <Button variant="primary" size="sm" type="submit" className="!rounded-full !h-8 !w-8 !p-0" disabled={isLoading || !input?.trim()}>
              <Send className="h-4 w-4 ml-0.5" />
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}

function MessageBubble({ m }: { m: any }) {
  const isAI = m.role === "assistant";
  
  // Exclude tool calls from UI directly unless we want to show a specialized widget
  // (Vercel AI SDK streams tool calls as separate messages or parts)
  if (m.role === "tool") return null;
  if (!m.content) return null;

  return (
    <div className={cn("flex gap-3", isAI ? "justify-start" : "justify-end")}>
      {isAI && (
        <IconOrb tone="teal" size="sm" className="mt-1">
          <Sparkles className="h-3.5 w-3.5" />
        </IconOrb>
      )}
      <div className={cn("max-w-[85%]", !isAI && "flex flex-col items-end")}>
        <div
          className={cn(
            "rounded-3xl px-5 py-3 text-sm leading-relaxed",
            isAI ? "glass-teal prose prose-sm prose-teal dark:prose-invert max-w-none break-words" : "glass-ink text-white",
          )}
        >
          {isAI ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {m.content}
            </ReactMarkdown>
          ) : (
            <div className="whitespace-pre-wrap">{m.content}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function TypingShimmer() {
  return (
    <div className="flex gap-3">
      <IconOrb tone="teal" size="sm">
        <Sparkles className="h-3.5 w-3.5" />
      </IconOrb>
      <div className="glass-teal rounded-2xl px-4 py-3">
        <span className="animate-pulse text-sm text-muted-foreground">
          Checking police records…
        </span>
      </div>
    </div>
  );
}
