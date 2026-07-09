import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { NETWORK, type NetworkNode } from "@/lib/scrb/mock";
import { GlassPanel, GlassPill, SectionLabel } from "@/components/scrb/primitives";
import { Car, User, MapPin, FileText, X, Search, Maximize2, Layers, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/network")({
  head: () => ({ meta: [{ title: "Network — SCRB Sahayak" }] }),
  component: NetworkPage,
});

type Kind = NetworkNode["kind"];

const KIND_ICON: Record<Kind, typeof User> = { Person: User, Vehicle: Car, Location: MapPin, Case: FileText };

// Palette per kind: fill (soft), ring (border), dot (solid)
const KIND_STYLE: Record<Kind, { fill: string; ring: string; dot: string; text: string; label: string }> = {
  Case:     { fill: "#FEF3E4", ring: "#F0B26B", dot: "#C97A1F", text: "#7A3E00", label: "Case / FIR" },
  Vehicle:  { fill: "#E6F1F3", ring: "#7FB4BE", dot: "#3D7C88", text: "#1F4A52", label: "Vehicle" },
  Person:   { fill: "#EEEBFA", ring: "#A99AE0", dot: "#6650C4", text: "#3A2D80", label: "Person" },
  Location: { fill: "#E8F1E7", ring: "#8CBB87", dot: "#4C8C46", text: "#265022", label: "Location" },
};

// ViewBox in 1000 units for precision
const VB = { w: 1000, h: 620 };

function toXY(n: NetworkNode) {
  return { x: (n.x / 100) * VB.w, y: (n.y / 100) * VB.h };
}

function NetworkPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeKinds, setActiveKinds] = useState<Record<Kind, boolean>>({
    Case: true, Vehicle: true, Person: true, Location: true,
  });

  const selected = NETWORK.nodes.find((n) => n.id === selectedId) ?? null;
  const focusId = hoverId ?? selectedId;

  const visibleNodes = useMemo(
    () => NETWORK.nodes.filter((n) => activeKinds[n.kind] && (query === "" || n.label.toLowerCase().includes(query.toLowerCase()))),
    [activeKinds, query],
  );
  const visibleIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = NETWORK.edges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to));

  const connectedIds = new Set<string>();
  if (focusId) {
    connectedIds.add(focusId);
    NETWORK.edges.forEach((e) => {
      if (e.from === focusId) connectedIds.add(e.to);
      if (e.to === focusId) connectedIds.add(e.from);
    });
  }

  const kindCounts = NETWORK.nodes.reduce<Record<Kind, number>>((acc, n) => {
    acc[n.kind] = (acc[n.kind] ?? 0) + 1;
    return acc;
  }, { Case: 0, Vehicle: 0, Person: 0, Location: 0 });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      {/* Canvas */}
      <GlassPanel strong className="relative overflow-hidden p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <SectionLabel>Entity Network</SectionLabel>
            <h1 className="text-display mt-1 text-2xl">Cross-case linkage canvas</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search entity…"
                className="w-52 rounded-xl border border-hairline bg-surface py-2 pr-3 pl-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/25 focus:outline-none"
              />
            </div>
            <button className="glass flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground">
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="relative mt-5 aspect-[16/10] w-full overflow-hidden rounded-3xl border border-hairline bg-[radial-gradient(ellipse_at_top,theme(colors.white),theme(colors.slate.50))]">
          {/* dotted grid */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-60" aria-hidden>
            <defs>
              <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="#0f172a" fillOpacity="0.06" />
              </pattern>
              <radialGradient id="vignette" cx="50%" cy="50%" r="60%">
                <stop offset="60%" stopColor="white" stopOpacity="0" />
                <stop offset="100%" stopColor="white" stopOpacity="0.7" />
              </radialGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#dots)" />
            <rect width="100%" height="100%" fill="url(#vignette)" />
          </svg>

          {/* graph */}
          <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${VB.w} ${VB.h}`} preserveAspectRatio="xMidYMid meet">
            <defs>
              <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
              </filter>
            </defs>

            {/* Edges */}
            <g>
              {visibleEdges.map((e, i) => {
                const a = toXY(NETWORK.nodes.find((n) => n.id === e.from)!);
                const b = toXY(NETWORK.nodes.find((n) => n.id === e.to)!);
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;
                // curve control offset perpendicular
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const len = Math.hypot(dx, dy) || 1;
                const nx = -dy / len;
                const ny = dx / len;
                const curve = 40;
                const cx = mx + nx * curve;
                const cy = my + ny * curve;
                const path = `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
                const isActive = !focusId || e.from === focusId || e.to === focusId;
                const pathId = `edge-${i}`;
                return (
                  <g key={i} className="transition-opacity" style={{ opacity: isActive ? 1 : 0.15 }}>
                    <path id={pathId} d={path} fill="none" stroke="#0f172a" strokeOpacity={isActive ? 0.35 : 0.2} strokeWidth={isActive ? 1.4 : 1} strokeLinecap="round" />
                    {/* animated pulse dot */}
                    {isActive && (
                      <circle r="3" fill="#C97A1F">
                        <animateMotion dur={`${3 + (i % 3)}s`} repeatCount="indefinite" path={path} />
                      </circle>
                    )}
                    {/* label */}
                    <text fontSize="10" fill="#475569" className="text-mono" textAnchor="middle" dy="-4">
                      <textPath href={`#${pathId}`} startOffset="50%">{e.label}</textPath>
                    </text>
                  </g>
                );
              })}
            </g>

            {/* Nodes */}
            <g>
              {visibleNodes.map((n) => {
                const p = toXY(n);
                const s = KIND_STYLE[n.kind];
                const isFocus = focusId === n.id;
                const isConnected = focusId ? connectedIds.has(n.id) : true;
                const r = n.kind === "Case" ? 30 : 24;
                return (
                  <g
                    key={n.id}
                    transform={`translate(${p.x} ${p.y})`}
                    style={{ cursor: "pointer", opacity: isConnected ? 1 : 0.35 }}
                    onMouseEnter={() => setHoverId(n.id)}
                    onMouseLeave={() => setHoverId(null)}
                    onClick={() => setSelectedId(n.id === selectedId ? null : n.id)}
                  >
                    {/* halo */}
                    {isFocus && (
                      <circle r={r + 14} fill={s.dot} opacity="0.15">
                        <animate attributeName="r" values={`${r + 10};${r + 18};${r + 10}`} dur="2.4s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle r={r + 4} fill="white" />
                    <circle r={r} fill={s.fill} stroke={s.ring} strokeWidth={isFocus ? 2.5 : 1.5} />
                    {/* corner dot indicating kind */}
                    <circle cx={r * 0.7} cy={-r * 0.7} r="4" fill={s.dot} />
                  </g>
                );
              })}
            </g>
          </svg>

          {/* HTML overlays: icons + labels on nodes (crisper than SVG text) */}
          {visibleNodes.map((n) => {
            const s = KIND_STYLE[n.kind];
            const Icon = KIND_ICON[n.kind];
            const isFocus = focusId === n.id;
            const isConnected = focusId ? connectedIds.has(n.id) : true;
            return (
              <div
                key={n.id}
                className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-opacity"
                style={{ left: `${n.x}%`, top: `${n.y}%`, opacity: isConnected ? 1 : 0.35 }}
              >
                <Icon className="h-4 w-4" style={{ color: s.text }} />
                <div
                  className={cn(
                    "mt-8 rounded-full border bg-white px-2 py-0.5 text-[10px] font-medium whitespace-nowrap shadow-sm transition",
                    isFocus && "scale-105",
                  )}
                  style={{ color: s.text, borderColor: s.ring }}
                >
                  {n.label}
                </div>
              </div>
            );
          })}

          {/* Legend */}
          <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-1.5 rounded-2xl border border-hairline bg-white/90 p-1.5 shadow-sm backdrop-blur">
            {(Object.keys(KIND_STYLE) as Kind[]).map((k) => {
              const s = KIND_STYLE[k];
              const active = activeKinds[k];
              return (
                <button
                  key={k}
                  onClick={() => setActiveKinds((p) => ({ ...p, [k]: !p[k] }))}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-[11px] font-medium transition",
                    active ? "hover:bg-muted" : "opacity-40",
                  )}
                  style={{ color: s.text }}
                >
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.dot }} />
                  {s.label}
                  <span className="text-mono text-[10px] text-muted-foreground">{kindCounts[k]}</span>
                </button>
              );
            })}
          </div>

          {/* Stats chip */}
          <div className="absolute top-4 right-4 flex items-center gap-2 rounded-2xl border border-hairline bg-white/90 px-3 py-1.5 text-[11px] shadow-sm backdrop-blur">
            <Activity className="h-3 w-3 text-amber" />
            <span className="text-mono text-muted-foreground">{visibleNodes.length} nodes · {visibleEdges.length} links</span>
          </div>
        </div>
      </GlassPanel>

      {/* Right rail */}
      <div className="flex flex-col gap-4">
        <GlassPanel className="p-5">
          <SectionLabel>Overview</SectionLabel>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <StatTile label="Entities" value={NETWORK.nodes.length} />
            <StatTile label="Links" value={NETWORK.edges.length} />
            <StatTile label="Cases" value={kindCounts.Case} tone="amber" />
            <StatTile label="Suspects" value={kindCounts.Person} />
          </div>
        </GlassPanel>

        <GlassPanel className="p-5">
          <div className="flex items-center justify-between">
            <SectionLabel>Selection</SectionLabel>
            {selected && (
              <button onClick={() => setSelectedId(null)} className="rounded-full p-1 text-muted-foreground hover:bg-muted">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {!selected ? (
            <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-hairline bg-surface-2 py-8 text-center">
              <Layers className="h-5 w-5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Tap a node to inspect linkages.</p>
            </div>
          ) : (
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: KIND_STYLE[selected.kind].dot }} />
                <SectionLabel>{selected.kind}</SectionLabel>
              </div>
              <p className="text-display mt-1 text-xl leading-tight">{selected.label}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Linked to {NETWORK.edges.filter((e) => e.from === selected.id || e.to === selected.id).length} node(s).
              </p>

              <div className="mt-4 space-y-1.5">
                <SectionLabel>Edges</SectionLabel>
                {NETWORK.edges
                  .filter((e) => e.from === selected.id || e.to === selected.id)
                  .map((e, i) => {
                    const otherId = e.from === selected.id ? e.to : e.from;
                    const other = NETWORK.nodes.find((n) => n.id === otherId)!;
                    const s = KIND_STYLE[other.kind];
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedId(other.id)}
                        className="group flex w-full items-center justify-between gap-2 rounded-2xl border border-hairline bg-surface px-3 py-2 text-left hover:bg-muted"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.dot }} />
                          <span className="truncate text-[11px] font-medium text-foreground">{other.label}</span>
                        </div>
                        <span className="text-mono shrink-0 text-[10px] text-muted-foreground">{e.label}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </GlassPanel>

        <GlassPanel className="p-5">
          <SectionLabel>Filters</SectionLabel>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(Object.keys(KIND_STYLE) as Kind[]).map((k) => (
              <GlassPill
                key={k}
                tone={activeKinds[k] ? "neutral" : "muted"}
                className={cn("cursor-pointer transition", !activeKinds[k] && "opacity-50")}
              >
                <button onClick={() => setActiveKinds((p) => ({ ...p, [k]: !p[k] }))} className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: KIND_STYLE[k].dot }} />
                  {k}
                </button>
              </GlassPill>
            ))}
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}

function StatTile({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "amber" }) {
  return (
    <div className={cn("rounded-2xl border border-hairline p-3", tone === "amber" ? "bg-amber/10" : "bg-surface-2")}>
      <p className="text-mono text-[10px] tracking-widest text-muted-foreground uppercase">{label}</p>
      <p className="text-display mt-1 text-2xl">{value}</p>
    </div>
  );
}
