"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function ModeToggle({ className }: { className?: string }) {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const transitioning = React.useRef(false);

  React.useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className={cn("h-[30px] w-[56px] rounded-full bg-surface-2 border border-hairline opacity-50", className)} />;
  }

  const isDark = theme === "dark";

  const handleToggle = (newTheme: "light" | "dark") => {
    if (!document.startViewTransition || transitioning.current) {
      setTheme(newTheme);
      return;
    }
    transitioning.current = true;
    const t = document.startViewTransition(() => {
      setTheme(newTheme);
    });
    t.finished.finally(() => { transitioning.current = false; });
  };

  return (
    <div
      className={cn("relative flex h-[30px] w-[56px] items-center rounded-full bg-surface-2 border border-hairline p-1 shadow-inner transition-colors hover:border-ink/50 z-50", className)}
      aria-label="Toggle theme"
    >
      {/* Background icons */}
      <div className="flex w-full justify-between px-[3px] pointer-events-none">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 opacity-70"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-400 opacity-70"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      </div>
      {/* Thumb */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 28 }}
        dragElastic={0.1}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          const offset = info.offset.x;
          const velocity = info.velocity.x;
          
          if (isDark && (offset < -14 || velocity < -200)) {
            handleToggle("light");
          } else if (!isDark && (offset > 14 || velocity > 200)) {
            handleToggle("dark");
          }
        }}
        onTap={() => handleToggle(isDark ? "light" : "dark")}
        animate={{ x: isDark ? 28 : 0 }}
        transition={{ type: "spring", stiffness: 700, damping: 30 }}
        className={cn(
          "absolute left-[3px] flex h-[22px] w-[22px] cursor-grab active:cursor-grabbing items-center justify-center rounded-full shadow-sm",
          isDark ? "bg-ink text-sky-100" : "bg-white text-amber-500 border border-hairline"
        )}
      >
        {isDark ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        )}
      </motion.div>
    </div>
  );
}
