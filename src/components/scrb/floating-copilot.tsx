"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Mic, Sparkles, X, Loader2 } from "lucide-react";
import { Button, IconOrb } from "./primitives";
import { cn } from "@/lib/utils";
import { useChat } from "@ai-sdk/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useCopilotStore } from "@/lib/store";

export function FloatingCopilot() {
  const { isOpen, setIsOpen, pageContext } = useCopilotStore();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  
  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput } = useChat({
    api: "/api/chat",
    body: {
      pageContext: `URL: ${pathname}\nPage Data/Context: ${pageContext}`
    },
    initialMessages: [
      {
        id: "welcome",
        role: "assistant",
        content: "Namaskara. I am your SCRB Investigation Copilot. How can I assist you on this page?",
      }
    ]
  });

  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, isOpen]);

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
        if (!isOpen) setIsOpen(true);
      };
      
      recognitionRef.current.onerror = (event: any) => {
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, [setInput, isOpen]);

  const toggleListen = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      if (!recognitionRef.current) return;
      try {
        const lang = localStorage.getItem("scrb_lang") === "KN" ? "kn-IN" : "en-IN";
        recognitionRef.current.lang = lang;
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        setIsListening(false);
      }
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input?.trim()) return;
    if (!isOpen) setIsOpen(true);
    handleSubmit(e);
  };

  // Close when clicking completely outside (handled via a generic document listener or a backdrop)
  // For a seamless feel, we'll use a backdrop that only appears when isOpen.

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center md:ml-32 transition-all">
        <div
          className={cn(
            "bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-white/60 dark:border-slate-700/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6),0_12px_40px_rgba(0,0,0,0.12)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_12px_40px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col relative transition-all duration-[400ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] will-change-auto",
            isOpen ? "w-[450px] h-[500px] rounded-[24px] justify-between" : "w-[380px] h-[52px] rounded-full justify-center"
          )}
        >
          {/* Header & Messages area */}
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col flex-1 overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/20 dark:border-white/10">
                  <div className="flex items-center gap-2">
                    <IconOrb tone="amber" size="sm">
                      <Sparkles className="w-3.5 h-3.5" />
                    </IconOrb>
                    <span className="text-sm font-semibold">Sahayak Copilot</span>
                  </div>
                  <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-full hover:bg-surface-2">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                  {messages.map((m) => (
                    <div key={m.id} className={cn("flex gap-3", m.role === "user" && "justify-end")}>
                      {m.role === "assistant" && (
                        <div className="h-6 w-6 shrink-0 rounded-full bg-amber flex items-center justify-center mt-1">
                          <Sparkles className="h-3 w-3 text-white" />
                        </div>
                      )}
                      
                      <div className={cn(
                        "rounded-2xl px-4 py-2.5 max-w-[85%] text-[13px] leading-relaxed shadow-sm",
                        m.role === "user" 
                          ? "bg-foreground text-background rounded-tr-sm" 
                          : "bg-surface-2 border border-hairline text-foreground rounded-tl-sm prose prose-sm prose-invert"
                      )}>
                        {m.role === "assistant" ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {m.content}
                          </ReactMarkdown>
                        ) : (
                          m.content
                        )}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex gap-3">
                      <div className="h-6 w-6 shrink-0 rounded-full bg-amber flex items-center justify-center mt-1">
                        <Sparkles className="h-3 w-3 text-white" />
                      </div>
                      <div className="rounded-2xl px-4 py-2.5 bg-surface-2 border border-hairline rounded-tl-sm flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber" />
                        <span className="text-[13px] text-muted-foreground">Thinking...</span>
                      </div>
                    </div>
                  )}
                  <div ref={endRef} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input Area (Pill or Bottom Bar) */}
          <form 
            onSubmit={onSubmit}
            className={cn(
              "flex items-center gap-2 w-full transition-all shrink-0 relative z-10",
              isOpen ? "p-3 border-t border-white/20 dark:border-white/10" : "px-2 py-1.5 h-full"
            )}
          >
            {!isOpen && (
              <div className="pl-2 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-amber-500" />
              </div>
            )}
            <input
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onFocus={() => setIsOpen(true)}
              placeholder="Ask Copilot anything..."
              className={cn(
                "flex-1 bg-transparent border-none text-sm focus:outline-none focus:ring-0 px-2",
                isOpen ? "text-foreground placeholder:text-muted-foreground" : "text-foreground placeholder:text-muted-foreground font-medium"
              )}
            />
            
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={toggleListen}
                className={cn(
                  "p-2 rounded-full transition-colors flex items-center justify-center",
                  isListening ? "bg-amber-500/20 text-amber-500" : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
                )}
              >
                <Mic className={cn("h-4 w-4", isListening && "animate-pulse")} />
              </button>
              <Button 
                variant={isOpen ? "primary" : "secondary"} 
                size="sm" 
                type="submit" 
                className="!rounded-full !h-8 !w-8 !p-0" 
                disabled={isLoading || !input?.trim()}
              >
                <Send className="h-3.5 w-3.5 ml-0.5" />
              </Button>
            </div>
          </form>

        </div>
      </div>
    </>
  );
}
