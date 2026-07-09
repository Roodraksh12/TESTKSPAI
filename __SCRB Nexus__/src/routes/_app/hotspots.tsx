import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { HOTSPOTS } from "@/lib/scrb/mock";
import { GlassPanel, GlassPill, IconOrb, SectionLabel } from "@/components/scrb/primitives";

export const Route = createFileRoute("/_app/hotspots")({
  head: () => ({ meta: [{ title: "Hotspots — SCRB Sahayak" }] }),
  component: HotspotsPage,
});

function HotspotsPage() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
      <GlassPanel strong className="relative overflow-hidden p-6">
        <SectionLabel>Live Hotspots · Bengaluru</SectionLabel>
        <h1 className="text-display mt-1 text-2xl">Risk map</h1>

        <div className="relative mt-5 aspect-[4/3] w-full overflow-hidden rounded-3xl border border-hairline bg-[radial-gradient(ellipse_at_50%_60%,rgba(46,143,143,0.15),transparent_65%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent)]">
          {/* Faux street grid */}
          <svg className="absolute inset-0 h-full w-full opacity-30" viewBox="0 0 100 75">
            {Array.from({ length: 10 }).map((_, i) => (
              <line key={"h" + i} x1="0" y1={i * 8} x2="100" y2={i * 8} stroke="rgba(255,255,255,0.15)" strokeWidth="0.15" />
            ))}
            {Array.from({ length: 14 }).map((_, i) => (
              <line key={"v" + i} x1={i * 8} y1="0" x2={i * 8} y2="75" stroke="rgba(255,255,255,0.15)" strokeWidth="0.15" />
            ))}
          </svg>
          {HOTSPOTS.map((h) => {
            const color = h.risk === "High" ? "rgba(226,163,61,0.55)" : h.risk === "Elevated" ? "rgba(46,143,143,0.55)" : "rgba(255,255,255,0.35)";
            return (
              <div key={h.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${h.x}%`, top: `${h.y}%` }}>
                <div className="h-16 w-16 rounded-full blur-2xl" style={{ background: color }} />
                <div className="glass absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full px-2.5 py-1 text-[10px] whitespace-nowrap">
                  {h.name}
                </div>
              </div>
            );
          })}
        </div>
      </GlassPanel>

      <div className="space-y-6">
        <GlassPanel strong className="p-6">
          <SectionLabel>Risk ranking</SectionLabel>
          <div className="mt-4 space-y-3">
            {HOTSPOTS.map((h) => (
              <div key={h.id} className="glass flex items-center gap-3 rounded-2xl p-3">
                <IconOrb tone={h.risk === "High" ? "amber" : "teal"} size="sm">
                  <AlertTriangle className="h-3.5 w-3.5" />
                </IconOrb>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{h.name}</p>
                  <p className="text-mono text-[10px] text-muted-foreground">{h.crimes} incidents · Q2</p>
                </div>
                <div className="text-right">
                  <GlassPill tone={h.risk === "High" ? "amber" : "teal"}>{h.risk}</GlassPill>
                  <p className={"mt-1 inline-flex items-center gap-1 text-[11px] " + (h.delta >= 0 ? "text-amber-soft" : "text-teal-soft")}>
                    {h.delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(h.delta)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel strong className="p-6">
          <SectionLabel>7-day trend</SectionLabel>
          <svg viewBox="0 0 200 60" className="mt-4 h-24 w-full">
            <defs>
              <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(46,143,143,0.55)" />
                <stop offset="100%" stopColor="rgba(46,143,143,0)" />
              </linearGradient>
            </defs>
            <path d="M0,45 L28,38 L56,42 L84,25 L112,30 L140,18 L168,22 L200,10 L200,60 L0,60 Z" fill="url(#g)" />
            <path d="M0,45 L28,38 L56,42 L84,25 L112,30 L140,18 L168,22 L200,10" stroke="rgba(117,205,205,0.9)" strokeWidth="1.2" fill="none" />
          </svg>
          <p className="mt-2 text-xs text-muted-foreground">Composite risk index across 5 tracked areas.</p>
        </GlassPanel>
      </div>
    </div>
  );
}
