import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ChatMessage = {
  role: string;
  content: string;
  kind?: 'intake' | 'normal';
};

interface CopilotState {
  isOpen: boolean;
  pageContext: string;
  chatHistory: ChatMessage[] | null;
  activeCaseId: string | null;
  intakeActionPrompts: string[];
  setIsOpen: (isOpen: boolean) => void;
  openCopilot: () => void;
  closeCopilot: () => void;
  setPageContext: (context: string) => void;
  setChatHistory: (history: ChatMessage[]) => void;
  clearChatHistory: () => void;
  setActiveCaseId: (caseId: string | null) => void;
  setIntakeActionPrompts: (prompts: string[]) => void;
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
      setIsOpen: (isOpen) => set({ isOpen }),
      openCopilot: () => set({ isOpen: true }),
      closeCopilot: () => set({ isOpen: false }),
      setPageContext: (context) => set({ pageContext: context }),
      setChatHistory: (history) => set({ chatHistory: history }),
      clearChatHistory: () => set({ chatHistory: null, intakeActionPrompts: [], activeCaseId: null }),
      setActiveCaseId: (caseId) => set({ activeCaseId: caseId }),
      setIntakeActionPrompts: (prompts) => set({ intakeActionPrompts: prompts }),
      seedIntakeBrief: ({ caseId, markdown, actionPrompts, pageContext }) =>
        set({
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
      }),
    }
  )
);
