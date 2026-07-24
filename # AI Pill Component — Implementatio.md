# AI Pill Component — Implementation Plan

A floating, bottom-center AI assistant pill that morphs from a compact trigger into a medium-sized glass input panel. Built with React, Tailwind CSS, and Frameron Motion.

----

## 1. What you are building

A reusable `AiPill` component that:

- Sits fixed at the bottom-center of every page (except the Copilot chat page).
- In its collapsed state, shows a spark icon, placeholder text, and a voice hint.
- Expands smoothly into a frosted-glass panel with a textarea, quick-prompt chips, mic toggle, and send button.
- Uses spring-based layout animations so the container morphs size and content crossfades.
- Forwards pending prompts to the main Copilot route via `sessionStorage`.

----

## 2. Tech stack

- React 18/19
- Tailwind CSS v3 or v4
- Framer Motion (`motion` package)
- Lucide React icons
- Optional: `clsx` / `tailwind-merge` for class composition

----

## 3. Design tokens (Tailwind)

Add these semantic tokens to your global CSS or Tailwind config:

```css
:root {
  --background: oklch(0.955 0.006 255);
  --surface: oklch(1 0 0);
  --foreground: oklch(0.22 0.02 255);
  --muted-foreground: oklch(0.52 0.04 255);
  --hairline: oklch(0.86 0.01 255);
  --muted: oklch(0.93 0.01 255);
  --ink: oklch(0.18 0.03 255);
  --teal: oklch(0.62 0.09 190);
  --amber: oklch(0.74 0.13 85);
  --destructive: oklch(0.55 0.2 25);
}
```

Map them to Tailwind utilities such as `bg-surface`, `text-foreground`, `border-hairline`, `bg-ink`, `text-teal`, etc.

----

## 4. File structure

```text
src/
  components/
    ai-pill.tsx          # the reusable component
  lib/
    utils.ts             # cn() helper if not already present
  routes/
    _app.tsx             # layout that renders <AiPill /> on child routes
    _app/
      dashboard.tsx      # Copilot page (AiPill hidden here)
      cases.tsx          # AiPill visible here
      network.tsx        # AiPill visible here
      ...
```

----

## 5. Component implementation

### 5.1 Utility helper

`src/lib/utils.ts`

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### 5.2 AiPill component

`src/components/ai-pill.tsx`

```tsx
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Mic, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

const PROMPT_STORAGE_KEY = "ai-pill-pending-prompt";

const QUICK_PROMPTS = [
  "Summarise FIR-2026-1021",
  "Link FIR-1042 & FIR-1039",
  "Theft hotspots this quarter",
];

export function AiPill({
  copilotRoute = "/dashboard",
}: {
  copilotRoute?: string;
}) {
  const [isOpen, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isTyping = input.trim().length > 0;

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const submit = () => {
    if (!isTyping) return;
    sessionStorage.setItem(PROMPT_STORAGE_KEY, input.trim());
    setInput("");
    setExpanded(false);
    window.location.href = copilotRoute;
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4 sm:bottom-8">
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 280, damping: 28, mass: 1 }}
        className={cn(
          "pointer-events-auto relative overflow-hidden rounded-[28px] border border-hairline",
          "bg-white/70 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.35)] backdrop-blur-2xl",
          "supports-[backdrop-filter]:bg-white/55"
        )}
        style={{
          width: isOpen ? "min(640px, 92vw)" : "min(420px, 92vw)",
        }}
      >
        {/* Top sheen */}
        <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-gradient-to-b from-white/60 via-white/0 to-white/0 opacity-70" />

        <AnimatePresence initial={false} mode="popLayout">
          {!isOpen ? (
            <motion.button
              key="collapsed"
              layout="position"
              type="button"
              onClick={() => setExpanded(true)}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="relative flex w-full items-center gap-3 px-5 py-3 text-left"
            >
              <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-teal/25 to-amber/20 text-foreground">
                <Sparkles className="h-4 w-4" />
                <motion.span
                  aria-hidden
                  className="absolute inset-0 rounded-full ring-2 ring-teal/30"
                  animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                />
              </span>
              <span className="flex-1 truncate text-[14px] text-muted-foreground">
                Ask Sahayak anything…{" "}
                <span className="text-mono text-[11px] opacity-70">⌘ + K</span>
              </span>
              <span className="hidden items-center gap-1 rounded-full border border-hairline bg-surface px-2 py-1 text-[11px] text-muted-foreground sm:inline-flex">
                <Mic className="h-3 w-3" /> Voice
              </span>
            </motion.button>
          ) : (
            <motion.div
              key="expanded"
              layout
              initial={{ opacity: 0, scale: 0.98, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 4 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              className="relative flex flex-col gap-3 p-4"
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-teal/25 to-amber/20">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <p className="text-[12px] font-medium tracking-wide text-foreground">
                  Sahayak Copilot
                </p>
                <p className="text-[11px] text-muted-foreground">
                  · Source-cited · Audit-logged
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setExpanded(false);
                    setInput("");
                  }}
                  className="ml-auto rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <motion.textarea
                layout="position"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                rows={3}
                placeholder="Ask about a FIR, entity, hotspot, or link a pattern across cases…"
                className="w-full resize-none rounded-2xl border border-hairline bg-white/60 px-4 py-3 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/10"
              />

              <motion.div
                layout="position"
                className="flex flex-wrap items-center gap-2"
              >
                {QUICK_PROMPTS.map((s, i) => (
                  <motion.button
                    key={s}
                    type="button"
                    layout="position"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: 0.05 * i,
                      type: "spring",
                      stiffness: 300,
                      damping: 28,
                    }}
                    onClick={() => setInput(s)}
                    className="rounded-full border border-hairline bg-surface px-3 py-1 text-[11px] text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
                  >
                    {s}
                  </motion.button>
                ))}

                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setListening((v) => !v)}
                    className={cn(
                      "relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-hairline transition",
                      listening
                        ? "bg-destructive/10 text-destructive"
                        : "bg-surface text-muted-foreground hover:text-foreground"
                    )}
                    aria-label="Voice"
                  >
                    <Mic className="h-4 w-4" />
                    {listening && (
                      <motion.span
                        className="absolute inset-0 rounded-full ring-2 ring-destructive/40"
                        animate={{ scale: [1, 1.35, 1], opacity: [0.7, 0, 0.7] }}
                        transition={{ duration: 1.4, repeat: Infinity }}
                      />
                    )}
                  </button>

                  <motion.button
                    type="button"
                    onClick={submit}
                    disabled={!isTyping}
                    whileTap={{ scale: 0.96 }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium transition",
                      isTyping
                        ? "bg-ink text-white shadow-[0_8px_20px_-8px_rgba(15,23,42,0.45)] hover:brightness-110"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
```

----

## 6. Layout integration

Render the pill inside a shared layout so it appears on every child route except the Copilot page itself.

`src/routes/_app.tsx`

```tsx
import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { AiPill } from "@/components/ai-pill";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const location = useLocation();
  const isCopilot = location.pathname === "/dashboard" || location.pathname === "/";

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <Outlet />
      {!isCopilot && <AiPill copilotRoute="/dashboard" />}
    </div>
  );
}
```

If you are not using TanStack Router, replace `useLocation` with your router's location hook.

----

## 7. Copilot route: consume pending prompt

When the user submits from the pill, the prompt is stored in `sessionStorage`. The Copilot page should read and clear it on mount.

`src/routes/_app/dashboard.tsx`

```tsx
import { useEffect, useState } from "react";

const PROMPT_STORAGE_KEY = "ai-pill-pending-prompt";

export function CopilotPage() {
  const [input, setInput] = useState("");

  useEffect(() => {
    const pending = sessionStorage.getItem(PROMPT_STORAGE_KEY);
    if (pending) {
      setInput(pending);
      sessionStorage.removeItem(PROMPT_STORAGE_KEY);
      // Optionally trigger send here
    }
  }, []);

  return (
    <div>
      {/* Your chat UI */}
      <textarea value={input} onChange={(e) => setInput(e.target.value)} />
    </div>
  );
}
```

----

## 8. Keyboard shortcut

Add a global `⌘+K` / `Ctrl+K` listener to open the pill from anywhere.

```tsx
useEffect(() => {
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      setExpanded(true);
    }
    if (e.key === "Escape" && isOpen) {
      setExpanded(false);
    }
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [isOpen]);
```

----

## 9. Animation notes

- `motion.div layout` on the outer container drives the width/height morph.
- `mode="popLayout"` on `AnimatePresence` lets the old layout exit while the new layout enters, avoiding jarring swaps.
- `layout="position"` on inner elements keeps them stable during the resize.
- Spring values used: `stiffness: 280`, `damping: 28`. Adjust `stiffness` up for snappier motion, down for slower, more dramatic motion.

----

## 10. Accessibility checklist

- The collapsed pill is a `<button>` with `src/components/ai-pill.tsx`.
- The close button has an `aria-label`.
- Focus moves into the textarea when expanded.
- `Escape` closes the expanded panel.
- Color contrast meets WCAG 2.1 AA for the `text-foreground` on `bg-surface` combination.

----

## 11. Optional enhancements

1. **Click outside to close**: attach a document click listener and ignore clicks inside the pill ref.
2. **Speech-to-text**: replace the mock `listening` state with the Web Speech API (`window.SpeechRecognition` / `webkitSpeechRecognition`).
3. **Toast confirmation**: show a small toast when a prompt is forwarded to the Copilot page.
4. **Route-aware placeholder**: pass a `context` prop to `AiPill` so the placeholder text changes per page.

----

## 12. Deliverables

After following this plan, your other project will contain:

1. `src/components/ai-pill.tsx` — the animated pill component.
2. `src/lib/utils.ts` — the `cn()` helper.
3. Updated layout route that renders `<AiPill />` on non-Copilot pages.
4. Copilot page logic that consumes the pending prompt from `sessionStorage`.
5. Optional global `⌘+K` shortcut and click-outside-to-close behavior.