"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  MessageSquare,
  BarChart2,
  Share2,
  Map as MapIcon,
  FileUp,
  Settings as SettingsIcon,
  LogOut,
  Search,
  Bell,
  Briefcase,
  Menu,
  User,
  Sparkles
} from "lucide-react";
import { SealMark } from "./insignia";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import { OmniSearch } from "./command-palette";
import { useCopilotStore } from "@/lib/store";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Copilot", icon: MessageSquare },
  { to: "/cases", label: "Cases Directory", icon: Briefcase },
  { to: "/analytics", label: "Analytics Dashboard", icon: BarChart2 },
  { to: "/network", label: "Entity Network", icon: Share2 },
  { to: "/hotspots", label: "Risk Hotspots", icon: MapIcon },
  { to: "/fir/upload", label: "FIR Intake", icon: FileUp },
] as const;

export function Header() {
  const { data: session } = useSession();
  const [searchOpen, setSearchOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-hairline bg-surface px-4 shadow-sm sm:px-6 lg:px-8">
      {/* Mobile Menu Button - Placeholder */}
      <button className="md:hidden text-muted-foreground hover:text-foreground">
        <Menu className="h-6 w-6" />
      </button>

      {/* Center: Search */}
      <div className="flex flex-1 items-center justify-center gap-4">
        <button 
          onClick={() => setSearchOpen(true)}
          className="flex w-full max-w-lg items-center gap-2 rounded-lg border border-hairline bg-surface-2 px-3 py-2 shadow-sm transition-colors hover:border-ink hover:ring-1 hover:ring-ink"
        >
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="flex-1 text-left bg-transparent text-sm text-muted-foreground">Search cases, entities, hotspots...</span>
          <div className="hidden items-center justify-center rounded border border-hairline bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:flex">
            ⌘ K
          </div>
        </button>
        <OmniSearch open={searchOpen} onOpenChange={setSearchOpen} />
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-4">
        {mounted ? (
          (() => {
            const isDark = theme === "dark";
            return (
              <div
                className="relative flex h-[30px] w-[56px] items-center rounded-full bg-surface-2 border border-hairline p-1 shadow-inner transition-colors hover:border-ink/50"
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
                  dragConstraints={isDark ? { left: -28, right: 0 } : { left: 0, right: 28 }}
                  dragElastic={0.1}
                  dragMomentum={false}
                  onDragEnd={(_, info) => {
                    const offset = info.offset.x;
                    const velocity = info.velocity.x;
                    
                    if (isDark && (offset < -14 || velocity < -200)) {
                      setTheme("light");
                    } else if (!isDark && (offset > 14 || velocity > 200)) {
                      setTheme("dark");
                    }
                  }}
                  onTap={() => setTheme(isDark ? "light" : "dark")}
                  animate={{ x: isDark ? 28 : 0 }}
                  transition={{ type: "spring", stiffness: 700, damping: 30 }}
                  className={cn(
                    "absolute left-[3px] flex h-[22px] w-[22px] cursor-grab active:cursor-grabbing items-center justify-center rounded-full shadow-sm",
                    isDark ? "bg-ink text-sky-100" : "bg-white text-amber-500 border border-hairline"
                  )}
                >
                  {isDark ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                  )}
                </motion.div>
              </div>
            );
          })()
        ) : (
          <div className="h-[30px] w-[56px] rounded-full bg-surface-2 border border-hairline opacity-50" />
        )}

        <button
          aria-label="Notifications"
          className="relative text-muted-foreground hover:text-foreground transition-colors p-2 rounded-full hover:bg-surface-2"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-surface"></span>
        </button>
      </div>
    </header>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="hidden w-64 flex-col border-r border-hairline bg-ink text-white dark:bg-surface-2 dark:text-foreground md:flex">
      {/* Branding */}
      <div className="flex h-16 shrink-0 items-center px-6 border-b border-ink-2 dark:border-hairline">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-surface text-ink dark:bg-ink dark:text-white">
            <SealMark size={20} />
          </div>
          <div className="flex flex-col justify-center">
            <span className="text-[15px] font-bold leading-none tracking-tight">SCRB Sahayak</span>
            <span className="mt-1 text-[10px] font-medium leading-none tracking-widest text-teal-soft uppercase opacity-80 dark:text-teal-500">
              Karnataka Police
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          const isCopilot = label === "Copilot";
          
          if (isCopilot) {
            return (
              <button
                key={label}
                onClick={(e) => {
                  e.preventDefault();
                  useCopilotStore.getState().openCopilot();
                }}
                className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-amber-500 hover:bg-white/10 dark:text-amber-500 dark:hover:bg-surface/50"
              >
                <Icon className="h-5 w-5 shrink-0 text-amber-500 group-hover:text-amber-400" />
                {label}
              </button>
            );
          }
          
          return (
            <Link
              key={to}
              href={to}
              aria-label={label}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-white/10 text-white dark:bg-surface dark:text-ink"
                  : "text-white/70 hover:bg-white/10 hover:text-white dark:text-muted-foreground dark:hover:bg-surface/50 dark:hover:text-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5 shrink-0", active ? "text-teal-soft dark:text-ink" : "text-white/50 group-hover:text-white/80 dark:text-muted-foreground")} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User & Settings */}
      <div className="flex shrink-0 items-center border-t border-ink-2 p-4 dark:border-hairline">
        <Link href="/settings" className="group flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-white/10 dark:hover:bg-surface/50">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-white dark:bg-surface dark:text-ink">
            <User className="h-4 w-4" />
          </div>
          <div className="hidden flex-col sm:flex min-w-0">
            <span className="text-sm font-medium leading-tight text-white dark:text-foreground truncate">
              {session?.user?.name || "Officer"}
            </span>
            <span className="text-xs text-white/60 dark:text-muted-foreground truncate">
              {session?.user?.badgeId || "KA-14827"}
            </span>
          </div>
        </Link>
      </div>
    </aside>
  );
}
