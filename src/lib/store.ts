import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CopilotState {
  isOpen: boolean;
  pageContext: string;
  chatHistory: { role: string; content: string }[] | null;
  setIsOpen: (isOpen: boolean) => void;
  openCopilot: () => void;
  closeCopilot: () => void;
  setPageContext: (context: string) => void;
  setChatHistory: (history: { role: string; content: string }[]) => void;
  clearChatHistory: () => void;
}

export const useCopilotStore = create<CopilotState>()(
  persist(
    (set) => ({
      isOpen: false,
      pageContext: '',
      chatHistory: null,
      setIsOpen: (isOpen) => set({ isOpen }),
      openCopilot: () => set({ isOpen: true }),
      closeCopilot: () => set({ isOpen: false }),
      setPageContext: (context) => set({ pageContext: context }),
      setChatHistory: (history) => set({ chatHistory: history }),
      clearChatHistory: () => set({ chatHistory: null }),
    }),
    {
      name: 'scrb-copilot-storage', // name of the item in the storage (must be unique)
      partialize: (state) => ({ chatHistory: state.chatHistory, pageContext: state.pageContext }), // Only persist memory and context
    }
  )
);
