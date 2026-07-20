"use client";

import { Link, useLocation } from "react-router-dom";
import { signOut, useSession } from "@/context/AuthContext";
import { ModeToggle } from "@/components/scrb/mode-toggle";
import {
  MessageSquare,
  BarChart2,
  Share2,
  Map as MapIcon,
  FileUp,
  LogOut,
  Search,
  Bell,
  Briefcase,
  Menu,
  ChevronRight,
  Settings,
  Clock,
  ClipboardList,
  LayoutDashboard,
} from "lucide-react";
import { SealMark, TricolourThread } from "./insignia";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { motion } from "framer-motion";
import { OmniSearch } from "./command-palette";

// Labels are i18n keys resolved at render time, so switching language
// re-renders the nav in place rather than needing a reload.
const NAV_SECTIONS = [
  {
    labelKey: "nav.command",
    items: [
      { to: "/overview", labelKey: "nav.dashboard", icon: LayoutDashboard },
      { to: "/dashboard", labelKey: "nav.copilot", icon: MessageSquare },
      { to: "/analytics", labelKey: "nav.analytics", icon: BarChart2 },
      { to: "/hotspots", labelKey: "nav.hotspots", icon: MapIcon },
      { to: "/deadlines", labelKey: "nav.deadlines", icon: Clock },
    ],
  },
  {
    labelKey: "nav.records",
    items: [
      { to: "/cases", labelKey: "nav.cases", icon: Briefcase },
      { to: "/network", labelKey: "nav.network", icon: Share2 },
      { to: "/fir/upload", labelKey: "nav.firIntake", icon: FileUp },
      { to: "/audit", labelKey: "nav.auditTrail", icon: ClipboardList },
    ],
  },
];

export function Header() {
  const { data: session } = useSession();
  const { t } = useI18n();
  const [searchOpen, setSearchOpen] = useState(false);

  const officerName = session?.user?.name || "Officer";
  const initials = officerName.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline bg-surface px-4 lg:px-6">
      <button className="md:hidden text-muted-foreground hover:text-foreground -ml-1">
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex flex-1 items-center gap-4">
        <button
          onClick={() => setSearchOpen(true)}
          className="flex w-full max-w-md items-center gap-2 rounded-xl border border-hairline bg-surface-2 px-3.5 py-2 text-sm transition-colors hover:border-foreground/25 focus-within:border-ink"
        >
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="flex-1 text-left text-sm text-muted-foreground">{t("header.searchPlaceholder")}</span>
          <div className="hidden items-center gap-1 rounded-md border border-hairline bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:flex">
            <span className="text-[9px]">⌘</span>K
          </div>
        </button>
        <OmniSearch open={searchOpen} onOpenChange={setSearchOpen} />
      </div>

      <div className="flex items-center gap-2">
        <button
          aria-label={t("header.notifications")}
          className="relative flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-amber ring-2 ring-surface" />
        </button>
        <ModeToggle />
      </div>
    </header>
  );
}

export function Sidebar() {
  const { pathname } = useLocation();
  const { data: session } = useSession();
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);

  const officerName = session?.user?.name || "Officer";
  const initials = officerName.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  const role = session?.user?.role || "OFFICER";

  return (
    <aside className={cn(
      "hidden md:flex flex-col border-r border-hairline bg-ink text-white transition-all duration-200",
      collapsed ? "w-16" : "w-60"
    )}>
      {/* Branding */}
      <div className={cn(
        "flex shrink-0 items-center border-b border-white/10 px-4",
        collapsed ? "h-14 justify-center" : "h-14 gap-3"
      )}>
        <Link to="/dashboard" className={cn("flex items-center", collapsed ? "" : "gap-3")}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <SealMark size={18} />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold leading-none tracking-tight text-white">SCRB Sahayak</span>
              <span className="mt-0.5 text-[9px] font-medium tracking-[0.2em] text-teal/80 uppercase">
                {t("brand.subtitle")}
              </span>
            </div>
          )}
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "ml-auto flex h-6 w-6 items-center justify-center rounded-md text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors",
            collapsed && "ml-0"
          )}
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", collapsed ? "" : "rotate-180")} />
        </button>
      </div>

      <TricolourThread />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.labelKey}>
            {!collapsed && (
              <p className="px-3 pb-1.5 text-[9px] font-semibold tracking-[0.2em] text-white/30 uppercase">
                {t(section.labelKey)}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map(({ to, labelKey, icon: Icon }) => {
                const label = t(labelKey);
                const active = pathname === to || pathname.startsWith(to + "/");
                return (
                  <Link
                    key={to}
                    to={to}
                    aria-label={label}
                    className={cn(
                      "group relative flex items-center rounded-xl text-sm font-medium transition-all",
                      collapsed ? "justify-center h-10 w-10 mx-auto" : "gap-3 px-3 py-2.5",
                      active
                        ? "bg-white/10 text-white"
                        : "text-white/60 hover:bg-white/5 hover:text-white/90"
                    )}
                  >
                    {active && !collapsed && (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-teal"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                    <Icon className={cn("h-4 w-4 shrink-0", active && "text-teal")} />
                    {!collapsed && label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User */}
      <div className={cn(
        "shrink-0 border-t border-white/10 p-3",
        collapsed && "flex flex-col items-center gap-2"
      )}>
        <Link
          to="/profile"
          className={cn(
            "flex items-center rounded-xl transition-colors hover:bg-white/5",
            collapsed ? "justify-center h-10 w-10" : "gap-3 px-3 py-2"
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-white">
            {initials}
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-white truncate">{officerName}</span>
                <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-teal uppercase tracking-wider">
                  {role === "SP" ? "SP" : role === "INSPECTOR" ? "INS" : "CON"}
                </span>
              </div>
              <span className="text-xs text-white/40 truncate">
                {session?.user?.badgeId || "KA-00000"}
              </span>
            </div>
          )}
        </Link>
        {!collapsed && (
          <div className="mt-2 flex items-center justify-between px-2">
            <Link
              to="/settings"
              className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/70 transition-colors"
            >
              <Settings className="h-3 w-3" />
              {t("nav.settings")}
            </Link>
            <button
              onClick={() => signOut()}
              className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/70 transition-colors"
            >
              <LogOut className="h-3 w-3" />
              {t("nav.signOut")}
            </button>
          </div>
        )}
        {collapsed && (
          <button
            onClick={() => signOut()}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  );
}
