"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { useTheme } from "next-themes";
import { Car, User, MapPin, FileText, Crosshair, Maximize2, Minus, Plus } from "lucide-react";
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

const MIN_ZOOM = 0.55;
const MAX_ZOOM = 3;
const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 };

type CanvasPoint = { x: number; y: number };

function clampZoom(value: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

function distanceBetween(a: CanvasPoint, b: CanvasPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpointBetween(a: CanvasPoint, b: CanvasPoint): CanvasPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

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
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const [isPanning, setIsPanning] = useState(false);
  const pointers = useRef(new Map<number, CanvasPoint>());
  const drag = useRef<{ pointerId: number; point: CanvasPoint } | null>(null);
  const pinch = useRef<{ distance: number; midpoint: CanvasPoint; viewport: typeof DEFAULT_VIEWPORT } | null>(null);
  const suppressNextNodeClick = useRef(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  const posById = new Map(positioned.map((n) => [n.id, n]));
  // Dense graphs start clean, then reveal labels as an officer zooms in.
  const showNodeLabels = positioned.length <= 12 || Boolean(pathIds) || viewport.zoom >= 1.45;

  const pointForEvent = (event: ReactPointerEvent<HTMLDivElement> | ReactWheelEvent<HTMLDivElement>): CanvasPoint => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left - bounds.width / 2,
      y: event.clientY - bounds.top - bounds.height / 2,
    };
  };

  const zoomAt = useCallback((nextZoom: number | ((currentZoom: number) => number), point: CanvasPoint) => {
    setViewport((current) => {
      const zoom = clampZoom(typeof nextZoom === "function" ? nextZoom(current.zoom) : nextZoom);
      if (zoom === current.zoom) return current;
      const scaleRatio = zoom / current.zoom;
      // Keep the entity beneath the pointer fixed while zooming, as on a map.
      return {
        zoom,
        x: point.x - (point.x - current.x) * scaleRatio,
        y: point.y - (point.y - current.y) * scaleRatio,
      };
    });
  }, []);

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    zoomAt((currentZoom) => currentZoom * Math.exp(-event.deltaY * 0.0015), pointForEvent(event));
  };

  const beginPinch = () => {
    const activePointers = [...pointers.current.values()];
    if (activePointers.length < 2) return;
    const [first, second] = activePointers;
    pinch.current = {
      distance: distanceBetween(first, second) || 1,
      midpoint: midpointBetween(first, second),
      viewport,
    };
    drag.current = null;
    setIsPanning(true);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as Element).closest("[data-network-controls]")) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointForEvent(event);
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size >= 2) {
      beginPinch();
      return;
    }
    drag.current = { pointerId: event.pointerId, point };
    suppressNextNodeClick.current = false;
    setIsPanning(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    const point = pointForEvent(event);
    pointers.current.set(event.pointerId, point);

    if (pointers.current.size >= 2 && pinch.current) {
      const [first, second] = [...pointers.current.values()];
      const nextDistance = distanceBetween(first, second) || 1;
      const nextMidpoint = midpointBetween(first, second);
      const nextZoom = clampZoom(pinch.current.viewport.zoom * (nextDistance / pinch.current.distance));
      const scaleRatio = nextZoom / pinch.current.viewport.zoom;
      setViewport({
        zoom: nextZoom,
        x: nextMidpoint.x - (pinch.current.midpoint.x - pinch.current.viewport.x) * scaleRatio,
        y: nextMidpoint.y - (pinch.current.midpoint.y - pinch.current.viewport.y) * scaleRatio,
      });
      suppressNextNodeClick.current = true;
      return;
    }

    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const deltaX = point.x - drag.current.point.x;
    const deltaY = point.y - drag.current.point.y;
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) suppressNextNodeClick.current = true;
    drag.current.point = point;
    if (deltaX || deltaY) {
      setViewport((current) => ({ ...current, x: current.x + deltaX, y: current.y + deltaY }));
    }
  };

  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size >= 2) {
      beginPinch();
      return;
    }
    pinch.current = null;
    const [remainingId, remainingPoint] = [...pointers.current.entries()][0] || [];
    drag.current = remainingId !== undefined && remainingPoint ? { pointerId: remainingId, point: remainingPoint } : null;
    setIsPanning(pointers.current.size > 0);
  };

  const handleNodeClick = (id: string) => {
    if (suppressNextNodeClick.current) {
      suppressNextNodeClick.current = false;
      return;
    }
    onNodeClick(id);
  };

  return (
    <div
      className={cn("absolute inset-0 touch-none select-none", isPanning ? "cursor-grabbing" : "cursor-grab")}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: "center center",
        }}
      >
        {/* The grid moves with the graph, making position changes easy to read. */}
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
                const isContext = e.category === "context";
                const isLead = e.category === "lead";
                const showEdgeLabel = Boolean(onPath) || (positioned.length <= 6 && !isContext && !isLead);
                return (
                  <g key={`${key}-${i}`} style={{ transition: "opacity 0.3s" }} className="text-foreground">
                    <path
                      id={`edge-${i}`}
                      d={path}
                      fill="none"
                      stroke={onPath ? PATH_COLOR : "currentColor"}
                      strokeOpacity={onPath ? 0.9 : isContext || isLead ? (active ? 0.18 : 0.08) : active ? 0.42 : 0.12}
                      strokeWidth={onPath ? 3 : isContext || isLead ? 1 : active ? 1.4 : 1}
                      strokeLinecap="round"
                      strokeDasharray={isContext || isLead ? "4 4" : undefined}
                    />
                    {showEdgeLabel && (
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
                    )}
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
                    data-network-node="true"
                    transform={`translate(${toX(n.x)} ${toY(n.y)})`}
                    style={{
                      cursor: "pointer",
                      opacity: isConnected || onPath ? 1 : 0.35,
                      transition: "transform 0.4s ease, opacity 0.3s",
                    }}
                    onMouseEnter={() => onNodeHover(n.id)}
                    onMouseLeave={() => onNodeHover(null)}
                    onClick={() => handleNodeClick(n.id)}
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
          {showNodeLabels && positioned.map((n) => {
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
      </div>

      {positioned.length > 0 && (
        <div
          data-network-controls
          className="absolute left-4 top-4 flex items-center gap-1 rounded-xl border border-hairline bg-surface/95 p-1 shadow-sm backdrop-blur"
          aria-label="Network map controls"
        >
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            onClick={() => zoomAt((currentZoom) => currentZoom - 0.2, { x: 0, y: 0 })}
            disabled={viewport.zoom <= MIN_ZOOM}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-10 text-center text-mono text-[10px] text-muted-foreground" aria-live="polite">
            {Math.round(viewport.zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            onClick={() => zoomAt((currentZoom) => currentZoom + 0.2, { x: 0, y: 0 })}
            disabled={viewport.zoom >= MAX_ZOOM}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
          <span className="mx-0.5 h-5 w-px bg-hairline" aria-hidden />
          <button
            type="button"
            aria-label="Fit network to canvas"
            title="Fit network to canvas"
            onClick={() => setViewport(DEFAULT_VIEWPORT)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {positioned.length > 0 && (
        <p className="pointer-events-none absolute bottom-4 right-4 rounded-lg bg-surface/85 px-2 py-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur">
          Scroll to zoom · drag to pan
        </p>
      )}
    </div>
  );
}
