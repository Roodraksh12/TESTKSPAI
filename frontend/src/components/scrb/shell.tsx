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
  Shield,
  UserPlus,
  KeyRound,
  AlertTriangle,
  CheckCheck,
  ExternalLink,
  Wifi,
} from "lucide-react";
import { SealMark, TricolourThread } from "./insignia";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { motion } from "framer-motion";
import { OmniSearch } from "./command-palette";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useEarlyWarnings } from "@/context/EarlyWarningsContext";

// Labels are i18n keys resolved at render time, so switching language
// re-renders the nav in place rather than needing a reload.
const NAV_SECTIONS = [
  {
    labelKey: "nav.command",
    items: [
      { to: "/overview", labelKey: "nav.dashboard", icon: LayoutDashboard, cap: "overview" },
      { to: "/dashboard", labelKey: "nav.copilot", icon: MessageSquare, cap: "copilot" },
      { to: "/analytics", labelKey: "nav.analytics", icon: BarChart2, cap: "analytics" },
      { to: "/hotspots", labelKey: "nav.hotspots", icon: MapIcon, cap: "hotspots" },
      { to: "/early-warnings", labelKey: "nav.earlyWarnings", icon: Bell, cap: "earlyWarnings" },
      { to: "/deadlines", labelKey: "nav.deadlines", icon: Clock, cap: "deadlines" },
    ],
  },
  {
    labelKey: "nav.records",
    items: [
      { to: "/cases", labelKey: "nav.cases", icon: Briefcase, cap: "cases" },
      { to: "/network", labelKey: "nav.network", icon: Share2, cap: "network" },
      { to: "/fir/upload", labelKey: "nav.firIntake", icon: FileUp, cap: "firIntake" },
      { to: "/audit", labelKey: "nav.auditTrail", icon: ClipboardList, cap: "audit" },
      { to: "/invite", labelKey: "nav.invite", icon: UserPlus, cap: "invite" },
      { to: "/password-resets", labelKey: "nav.passwordResets", icon: KeyRound, cap: "passwordResets" },
      { to: "/administration", labelKey: "nav.admin", icon: Shield, cap: "administration" },
    ],
  },
];

function roleBadge(role: string) {
  if (role === "POLICE_IT") return "IT";
  if (role === "SP" || role === "ADDL_SP_DCP") return "SP";
  if (role === "INSPECTOR" || role === "SHO") return "SHO";
  if (role === "DYSP") return "DySP";
  if (role === "CONSTABLE" || role === "SI" || role === "ASI" || role === "HEAD_CONSTABLE") return "CON";
  return role.slice(0, 3);
}

function NotificationBell() {
  const { t } = useI18n();
  const {
    enabled,
    warnings,
    unreadCount,
    loading,
    error,
    lastUpdated,
    markRead,
    markAllRead,
  } = useEarlyWarnings();
  const [open, setOpen] = useState(false);

  if (!enabled) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={`${t("header.notifications")}${unreadCount ? ` (${unreadCount})` : ""}`}
          className="relative flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white ring-2 ring-surface">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border-hairline bg-surface p-0 shadow-xl"
      >
        <div className="flex items-start justify-between border-b border-hairline p-4">
          <div>
            <h2 className="text-sm font-semibold">{t("header.notifications")}</h2>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Wifi className={cn("h-3 w-3", !error && "text-teal")} />
              {error
                ? t("warnings.offline")
                : loading && !lastUpdated
                  ? t("warnings.connecting")
                  : `${t("warnings.live")} · ${
                      lastUpdated
                        ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "—"
                    }`}
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => void markAllRead()}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-teal hover:text-foreground"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {t("warnings.markAll")}
            </button>
          )}
        </div>

        <div className="max-h-[24rem] overflow-y-auto">
          {warnings.length === 0 ? (
            <div className="flex min-h-32 flex-col items-center justify-center gap-2 p-5 text-center">
              <CheckCheck className="h-7 w-7 text-teal" />
              <p className="text-xs text-muted-foreground">{t("warnings.none")}</p>
            </div>
          ) : (
            warnings.slice(0, 5).map((warning) => {
              const query = new URLSearchParams({
                warning: warning.id,
                lat: String(warning.latitude),
                lng: String(warning.longitude),
              });
              return (
                <Link
                  key={warning.id}
                  to={`/hotspots?${query.toString()}`}
                  onClick={() => {
                    void markRead(warning.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex gap-3 border-b border-hairline p-3.5 transition-colors last:border-b-0 hover:bg-surface-2",
                    !warning.isRead && "bg-amber/5"
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      warning.severity === "CRITICAL"
                        ? "bg-danger/15 text-danger"
                        : warning.severity === "HIGH"
                          ? "bg-amber/15 text-amber"
                          : "bg-teal/15 text-teal"
                    )}
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-xs font-semibold">{warning.zoneLabel}</p>
                      {!warning.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
                      {warning.reason}
                    </p>
                    <p className="mt-1.5 text-[9px] font-semibold text-muted-foreground">
                      {warning.severity} · {Math.round(warning.riskScore)}% · {warning.stationName}
                    </p>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        <Link
          to="/early-warnings"
          onClick={() => setOpen(false)}
          className="flex items-center justify-center gap-1.5 border-t border-hairline bg-surface-2 px-4 py-3 text-xs font-semibold hover:text-teal"
        >
          {t("warnings.activeFeed")} <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </PopoverContent>
    </Popover>
  );
}

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

      <div className="flex flex-1 items-center justify-center gap-4">
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
        <NotificationBell />
        <ModeToggle />
        <Link
          to="/profile"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white dark:bg-foreground dark:text-background"
          aria-label={officerName}
        >
          {initials}
        </Link>
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
  const navCaps = session?.user?.capabilities?.nav || {};
  const home = session?.user?.capabilities?.defaultHome || "/dashboard";

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
        <Link to={home} className={cn("flex items-center", collapsed ? "" : "gap-3")}>
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
        {NAV_SECTIONS.map((section) => {
          const visible = section.items.filter((item) => navCaps[item.cap] !== false);
          if (visible.length === 0) return null;
          return (
          <div key={section.labelKey}>
            {!collapsed && (
              <p className="px-3 pb-1.5 text-[9px] font-semibold tracking-[0.2em] text-white/30 uppercase">
                {t(section.labelKey)}
              </p>
            )}
            <div className="space-y-0.5">
              {visible.map(({ to, labelKey, icon: Icon, cap }) => {
                const resolvedKey =
                  cap === "administration" && session?.user?.capabilities?.isPoliceIt
                    ? "nav.officers"
                    : labelKey;
                const label = t(resolvedKey);
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
          );
        })}
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
                  {roleBadge(role)}
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
