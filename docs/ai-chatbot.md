# AI Chatbot Module

## Overview
The AI Chatbot (Investigation Copilot) is a natural language interface designed to assist investigators in retrieving and analyzing data from the KSP Crime Database. By moving away from complex search filters, officers can interact with the system using everyday conversational language in both English and Kannada.

## Key Features
- **Natural Language Processing:** Understands complex conversational queries like "Show me all chain snatching cases from last week".
- **Bilingual Support:** Full support for both English and Kannada input and output, catering to local operational needs.
- **Voice-Enabled Interaction:** Built-in Speech Recognition allows officers to dictate their queries hands-free.
- **Context-Aware Memory:** The system retains the context of the active session. If an officer asks about a specific FIR, follow-up questions do not require repeating the FIR number.
- **File Attachments:** Users can attach documents directly to the chat for the AI to analyze in context.

## Technical Implementation
- **Frontend:** Built using React/Next.js client components (`src/components/scrb/chat.tsx`). It maintains conversation state via `sessionStorage` to persist context across page navigations.
- **Backend:** Powered by an API route (`src/app/api/chat/route.ts`) integrating with the OpenRouter API. It parses the conversational history and passes it to the LLM (e.g., `google/gemini-1.5-pro` or other configurable models) to maintain state and generate intelligent responses.
- **Speech API:** Utilizes the native browser `window.SpeechRecognition` API with fallback error handling.
