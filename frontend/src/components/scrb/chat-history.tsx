import { useEffect, useState, useCallback } from "react";
import { History, Plus, Trash2, MessageSquare, X } from "lucide-react";
import { apiRequest } from "@/api/client";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/scrb/datetime";
import type { ChatMessage } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

export type ChatSessionSummary = {
  id: string;
  title: string;
  activeCaseId: string | null;
  activeCaseFir: string | null;
  messageCount: number;
  createdAt: string;
  lastMessageAt: string;
};

export function ChatHistoryPanel({
  open,
  onClose,
  currentSessionId,
  refreshKey,
  onNewChat,
  onLoadSession,
}: {
  open: boolean;
  onClose: () => void;
  currentSessionId: string | null;
  /** Bumped by the parent after each reply so the list picks up new sessions. */
  refreshKey: number;
  onNewChat: () => void;
  onLoadSession: (sessionId: string, messages: ChatMessage[]) => void;
}) {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiRequest("/api/chat/sessions")
      .then((payload) => setSessions(payload.sessions || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, refreshKey, load]);

  const handleOpenSession = async (sessionId: string) => {
    setLoadingId(sessionId);
    try {
      const payload = await apiRequest(`/api/chat/sessions/${sessionId}`);
      onLoadSession(sessionId, payload.messages || []);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (event: React.MouseEvent, sessionId: string) => {
    event.stopPropagation();
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    try {
      await apiRequest(`/api/chat/sessions/${sessionId}`, { method: "DELETE" });
      // Deleting the open conversation leaves the transcript on screen with no
      // thread behind it — start a clean one so the next message has a home.
      if (sessionId === currentSessionId) onNewChat();
    } catch (err) {
      console.error(err);
      load();
    }
  };

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-20 flex">
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={onClose} />

      <aside className="relative z-10 flex h-full w-80 max-w-[85vw] flex-col border-r border-hairline bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-teal" />
            <h3 className="text-sm font-bold text-foreground">{t("copilot.conversations")}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-hairline p-3">
          <button
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-3 py-2 text-[12px] font-medium text-white transition hover:bg-ink-2 dark:bg-foreground dark:text-background"
          >
            <Plus className="h-3.5 w-3.5" /> {t("copilot.newConversation")}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="space-y-2 p-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-2" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                {t("copilot.noConversations")}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => handleOpenSession(session.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleOpenSession(session.id);
                  }}
                  className={cn(
                    "group flex cursor-pointer items-start gap-2 rounded-xl px-3 py-2.5 transition-colors",
                    session.id === currentSessionId ? "bg-teal/10 border border-teal/25" : "hover:bg-surface-2 border border-transparent",
                    loadingId === session.id && "opacity-50"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-foreground">{session.title}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-mono text-[10px] text-muted-foreground">
                        {relativeTime(session.lastMessageAt)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {session.messageCount} message{session.messageCount === 1 ? "" : "s"}
                      </span>
                      {session.activeCaseFir && (
                        <span className="rounded bg-amber/10 px-1.5 py-0.5 text-[9px] font-medium text-amber">
                          {session.activeCaseFir}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, session.id)}
                    aria-label={`Delete conversation: ${session.title}`}
                    className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-danger/10 hover:text-danger group-hover:opacity-100 focus:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-hairline px-4 py-2.5">
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            {t("copilot.historyPrivacy")}
          </p>
        </div>
      </aside>
    </div>
  );
}
