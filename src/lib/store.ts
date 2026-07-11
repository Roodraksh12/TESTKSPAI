import { create } from 'zustand';

interface CopilotState {
  isOpen: boolean;
  pageContext: string;
  setIsOpen: (isOpen: boolean) => void;
  openCopilot: () => void;
  closeCopilot: () => void;
  setPageContext: (context: string) => void;
}

export const useCopilotStore = create<CopilotState>((set) => ({
  isOpen: false,
  pageContext: '',
  setIsOpen: (isOpen) => set({ isOpen }),
  openCopilot: () => set({ isOpen: true }),
  closeCopilot: () => set({ isOpen: false }),
  setPageContext: (context) => set({ pageContext: context }),
}));
