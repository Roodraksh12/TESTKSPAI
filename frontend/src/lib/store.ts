import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ChatMessage = {
  role: string;
  content: string;
  kind?: 'intake' | 'normal';
  toolsUsed?: string[];
  sources?: string[];
  sourceCases?: { id: string; firNumber: string }[];
  privacy?: AiPrivacyMetadata | null;
};

export type AiPrivacyMetadata = {
  processingMode: 'SANITISED_EXTERNAL' | 'PRIVATE_MODEL';
  provider: string;
  model: string;
  external: boolean;
  retentionPolicy: 'ZDR_REQUIRED' | 'PRIVATE_BOUNDARY';
  redaction: {
    applied: boolean;
    total: number;
    categories: { category: string; count: number }[];
  };
  durationMs: number;
  privacyProcessingMs: number;
};

interface CopilotState {
  isOpen: boolean;
  pageContext: string;
  chatHistory: ChatMessage[] | null;
  activeCaseId: string | null;
  intakeActionPrompts: string[];
  /** Server-side ChatSession this conversation is being persisted into. */
  sessionId: string | null;
  setIsOpen: (isOpen: boolean) => void;
  openCopilot: () => void;
  closeCopilot: () => void;
  setPageContext: (context: string) => void;
  setChatHistory: (history: ChatMessage[]) => void;
  clearChatHistory: () => void;
  setActiveCaseId: (caseId: string | null) => void;
  setIntakeActionPrompts: (prompts: string[]) => void;
  setSessionId: (sessionId: string | null) => void;
  /** Drop local state so the next message opens a fresh server-side session. */
  startNewSession: () => void;
  /** Replace the visible conversation with one loaded from history. */
  loadSession: (sessionId: string, messages: ChatMessage[]) => void;
  /** After FIR save: seed chat with intake brief and route officer into copilot */
  seedIntakeBrief: (opts: {
    caseId: string;
    markdown: string;
    actionPrompts?: string[];
    pageContext?: string;
  }) => void;
}

export const useCopilotStore = create<CopilotState>()(
  persist(
    (set) => ({
      isOpen: false,
      pageContext: '',
      chatHistory: null,
      activeCaseId: null,
      intakeActionPrompts: [],
      sessionId: null,
      setIsOpen: (isOpen) => set({ isOpen }),
      openCopilot: () => set({ isOpen: true }),
      closeCopilot: () => set({ isOpen: false }),
      setPageContext: (context) => set({ pageContext: context }),
      setChatHistory: (history) => set({ chatHistory: history }),
      clearChatHistory: () =>
        set({ chatHistory: null, intakeActionPrompts: [], activeCaseId: null, sessionId: null }),
      setActiveCaseId: (caseId) => set({ activeCaseId: caseId }),
      setIntakeActionPrompts: (prompts) => set({ intakeActionPrompts: prompts }),
      setSessionId: (sessionId) => set({ sessionId }),
      startNewSession: () =>
        set({
          chatHistory: null,
          sessionId: null,
          intakeActionPrompts: [],
          activeCaseId: null,
          pageContext: '',
        }),
      loadSession: (sessionId, messages) =>
        set({ sessionId, chatHistory: messages, intakeActionPrompts: [] }),
      seedIntakeBrief: ({ caseId, markdown, actionPrompts, pageContext }) =>
        set({
          // A new case intake starts its own conversation thread.
          sessionId: null,
          activeCaseId: caseId,
          pageContext: pageContext || `Active case after FIR intake: ${caseId}`,
          intakeActionPrompts: actionPrompts || [
            'Review identity matches and tell me which to confirm',
            'Show MO-similar cases for this FIR',
            'Give me the 24–72h investigation checklist',
            'Draft a short SP/SHO progress note for this case',
            'Which legal sections fit these facts?',
          ],
          chatHistory: [
            {
              role: 'assistant',
              content: markdown,
              kind: 'intake',
            },
          ],
          isOpen: true,
        }),
    }),
    {
      name: 'scrb-copilot-storage',
      partialize: (state) => ({
        chatHistory: state.chatHistory,
        pageContext: state.pageContext,
        activeCaseId: state.activeCaseId,
        intakeActionPrompts: state.intakeActionPrompts,
        sessionId: state.sessionId,
      }),
    }
  )
);
