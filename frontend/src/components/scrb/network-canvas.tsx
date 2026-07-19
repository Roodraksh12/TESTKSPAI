"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Car, User, MapPin, FileText, Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GraphEdge, NodeKind, PositionedNode } from "@/lib/scrb/graph-view";

export const KIND_ICON: Record<NodeKind, typeof User> = { Person: User, Vehicle: Car, Location: MapPin, Case: FileText };

export const KIND_STYLE: Record<NodeKind, { fill: string; ring: string; dot: string; text: string; darkText: string; label: string }> = {
  Case: { fill: "#FEF3E4", ring: "#F0B26B", dot: "#C97A1F", text: "#7A3E00", darkText: "#F0B26B", label: "Case / FIR" },
  Vehicle: { fill: "#E6F1F3", ring: "#7FB4BE", dot: "#3D7C88", text: "#1F4A52", darkText: "#7FB4BE", label: "Vehicle" },
  Person: { fill: "#EEEBFA", ring: "#A99AE0", dot: "#6650C4", text: "#3A2D80", darkText: "#A99AE0", label: "Person" },
  Location: { fill: "#E8F1E7", ring: "#8CBB87", dot: "#4C8C46", text: "#265022", darkText: "#8CBB87", label: "Location" },
};

/** Path highlight colour — the teal used for a traced connection chain. */
const PATH_COLOR = "#3D7C88";

const VB = { w: 1000, h: 620 };
const toX = (pct: number) => (pct / 100) * VB.w;
const toY = (pct: number) => (pct / 100) * VB.h;

export function NetworkCanvas({
  positioned,
  visibleEdges,
  focusId,
  connectedToFocus,
  pathIds,
  pathEdgeSet,
  expandableIds,
  emptyHint,
  onNodeClick,
  onNodeHover,
}: {
  positioned: PositionedNode[];
  visibleEdges: GraphEdge[];
  focusId: string | null;
  connectedToFocus: Set<string> | null;
  pathIds: string[] | null;
  pathEdgeSet: Set<string> | null;
  /** Nodes that still have unrevealed neighbours — drawn with a "+" affordance. */
  expandableIds: Set<string>;
  emptyHint: string;
  onNodeClick: (id: string) => void;
  onNodeHover: (id: string | null) => void;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  const posById = new Map(positioned.map((n) => [n.id, n]));

  return (
    <>
      {/* dotted grid */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-60 text-foreground" aria-hidden>
        <defs>
          <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="currentColor" fillOpacity="0.1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
      </svg>

      {positioned.length === 0 ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
          <Crosshair className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{emptyHint}</p>
        </div>
      ) : (
        <>
          <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${VB.w} ${VB.h}`} preserveAspectRatio="xMidYMid meet">
            <g>
              {visibleEdges.map((e, i) => {
                const a = posById.get(e.from);
                const b = posById.get(e.to);
                if (!a || !b) return null;
                const ax = toX(a.x), ay = toY(a.y), bx = toX(b.x), by = toY(b.y);
                const mx = (ax + bx) / 2, my = (ay + by) / 2;
                const dx = bx - ax, dy = by - ay;
                const len = Math.hypot(dx, dy) || 1;
                // Bow the edge perpendicular to its own direction so parallel
                // links between the same clusters stay individually readable.
                const cx = mx + (-dy / len) * 40;
                const cy = my + (dx / len) * 40;
                const path = `M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
                const key = [e.from, e.to].sort().join("|");
                const onPath = pathEdgeSet?.has(key);
                const dimmed = focusId ? !(e.from === focusId || e.to === focusId) : false;
                const active = onPath ? true : !dimmed;
                return (
                  <g key={`${key}-${i}`} style={{ transition: "opacity 0.3s" }} className="text-foreground">
                    <path
                      id={`edge-${i}`}
                      d={path}
                      fill="none"
                      stroke={onPath ? PATH_COLOR : "currentColor"}
                      strokeOpacity={onPath ? 0.9 : active ? 0.35 : 0.12}
                      strokeWidth={onPath ? 3 : active ? 1.4 : 1}
                      strokeLinecap="round"
                    />
                    <text
                      fontSize="10"
                      fill={onPath ? PATH_COLOR : "currentColor"}
                      className="text-mono"
                      style={{ opacity: onPath ? 1 : active ? 0.7 : 0.2 }}
                      textAnchor="middle"
                      dy="-4"
                    >
                      <textPath href={`#edge-${i}`} startOffset="50%">
                        {e.label}
                      </textPath>
                    </text>
                  </g>
                );
              })}
            </g>
            <g>
              {positioned.map((n) => {
                const s = KIND_STYLE[n.kind];
                const isFocus = focusId === n.id;
                const onPath = pathIds?.includes(n.id);
                const isConnected = connectedToFocus ? connectedToFocus.has(n.id) : true;
                const r = n.kind === "Case" ? 30 : 24;
                const canExpand = expandableIds.has(n.id);
                return (
                  <g
                    key={n.id}
                    transform={`translate(${toX(n.x)} ${toY(n.y)})`}
                    style={{
                      cursor: "pointer",
                      opacity: isConnected || onPath ? 1 : 0.35,
                      transition: "transform 0.4s ease, opacity 0.3s",
                    }}
                    onMouseEnter={() => onNodeHover(n.id)}
                    onMouseLeave={() => onNodeHover(null)}
                    onClick={() => onNodeClick(n.id)}
                  >
                    {(isFocus || onPath) && (
                      <circle r={r + 14} fill={onPath ? PATH_COLOR : s.dot} opacity="0.15">
                        <animate attributeName="r" values={`${r + 10};${r + 18};${r + 10}`} dur="2.4s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle r={r + 4} className="fill-surface-2" />
                    <circle r={r} fill={s.fill} stroke={onPath ? PATH_COLOR : s.ring} strokeWidth={isFocus || onPath ? 2.5 : 1.5} />
                    <circle cx={r * 0.7} cy={-r * 0.7} r="4" fill={s.dot} />
                    {canExpand && (
                      <>
                        <circle cx={r * 0.7} cy={r * 0.7} r="6" fill={isDark ? "#101014" : "#fff"} stroke={s.ring} strokeWidth="1.5" />
                        <text x={r * 0.7} y={r * 0.7 + 3} fontSize="10" textAnchor="middle" fill={isDark ? s.darkText : s.text}>
                          +
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* HTML label overlays — crisper text than SVG, and they inherit app fonts. */}
          {positioned.map((n) => {
            const s = KIND_STYLE[n.kind];
            const Icon = KIND_ICON[n.kind];
            const isFocus = focusId === n.id;
            const onPath = pathIds?.includes(n.id);
            const isConnected = connectedToFocus ? connectedToFocus.has(n.id) : true;
            return (
              <div
                key={n.id}
                className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{
                  left: `${n.x}%`,
                  top: `${n.y}%`,
                  opacity: isConnected || onPath ? 1 : 0.35,
                  transition: "left 0.4s ease, top 0.4s ease, opacity 0.3s",
                }}
              >
                <Icon className="h-4 w-4" style={{ color: isDark ? s.darkText : s.text }} />
                <div
                  className={cn(
                    "mt-8 rounded-full border bg-surface px-2 py-0.5 text-[10px] font-medium whitespace-nowrap shadow-sm",
                    (isFocus || onPath) && "scale-105"
                  )}
                  style={{ color: isDark ? s.darkText : s.text, borderColor: onPath ? PATH_COLOR : s.ring }}
                >
                  {n.label}
                </div>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
