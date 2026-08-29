"use client";

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import jsPDF from "jspdf";
import { Search, Layers, Activity, Route, Compass, Sparkles, CircleAlert, Link2 } from "lucide-react";
import { apiRequest } from "@/api/client";
import { Button, Card, SectionLabel, Skeleton } from "@/components/scrb/primitives";
import { cn } from "@/lib/utils";
import { NetworkCanvas, KIND_STYLE } from "@/components/scrb/network-canvas";
import {
  KeyPlayersPanel,
  RingsPanel,
  SelectionPanel,
  EvidenceBoardPanel,
  ConnectionChainPanel,
  type Ring,
  type KeyPlayer,
} from "@/components/scrb/network-panels";
import {
  buildAdjacency,
  layoutGraph,
  normalizeNetworkFocusId,
  shortestPath,
  type GraphEdge,
  type GraphNode,
  type NodeKind,
} from "@/lib/scrb/graph-view";
import { useI18n } from "@/lib/i18n";
import { buildNetworkBrief, pushNetworkBriefToCopilot } from "@/lib/scrb/network-brief";

type Mode = "explore" | "path";
const MAX_EXPLORE_NODES = 14;

type NetworkMeta = {
  caseCount: number;
  capped: boolean;
  sharedEntityCount: number;
  verifiedLinkCount: number;
  pendingLeadCount: number;
};

const EMPTY_META: NetworkMeta = {
  caseCount: 0,
  capped: false,
  sharedEntityCount: 0,
  verifiedLinkCount: 0,
  pendingLeadCount: 0,
};

export default function NetworkPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryFocusId = normalizeNetworkFocusId(searchParams.get("focusId"));
  const { t } = useI18n();

  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [leadEdges, setLeadEdges] = useState<GraphEdge[]>([]);
  const [rings, setRings] = useState<Ring[]>([]);
  const [hubs, setHubs] = useState<KeyPlayer[]>([]);
  const [brokers, setBrokers] = useState<KeyPlayer[]>([]);
  const [meta, setMeta] = useState<NetworkMeta>(EMPTY_META);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [seeded, setSeeded] = useState(false);

  const [mode, setMode] = useState<Mode>("explore");
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeKinds, setActiveKinds] = useState<Record<NodeKind, boolean>>({
    Case: true, Vehicle: true, Person: true, Location: true,
  });

  // Path mode
  const [pathFromId, setPathFromId] = useState<string | null>(null);
  const [pathToId, setPathToId] = useState<string | null>(null);
  const [pathIds, setPathIds] = useState<string[] | null>(null);
  const [pathError, setPathError] = useState<string | null>(null);

  // Investigation tools
  const [playerTab, setPlayerTab] = useState<"hubs" | "brokers">("hubs");
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [showLeads, setShowLeads] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    const url = queryFocusId ? `/api/network?seedId=${encodeURIComponent(queryFocusId)}` : "/api/network";
    apiRequest(url, { fresh: true })
      .then((payload) => {
        if (cancelled) return;
        setNodes(payload.nodes || []);
        setEdges(payload.edges || []);
        setLeadEdges(payload.leads || []);
        setRings(payload.rings || []);
        setHubs(payload.hubs || []);
        setBrokers(payload.brokers || []);
        setMeta({ ...EMPTY_META, ...(payload.meta || {}) });
        setSeeded(false); // allow re-seeding local canvas after new fetch
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setLoadError(err?.message || "Unable to load the investigation network.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queryFocusId, reloadKey]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const adjacency = useMemo(() => buildAdjacency(edges), [edges]);
  const neighborsOf = (id: string) => adjacency.get(id) ?? new Set<string>();

  function focusedNeighborhood(id: string, limit = MAX_EXPLORE_NODES) {
    const kindPriority: Record<NodeKind, number> = { Person: 0, Vehicle: 1, Case: 2, Location: 3 };
    const orderedNeighbors = Array.from(adjacency.get(id) ?? []).sort((a, b) => {
      const aNode = nodeById.get(a);
      const bNode = nodeById.get(b);
      const kindDiff = (kindPriority[aNode?.kind ?? "Location"] ?? 9) - (kindPriority[bNode?.kind ?? "Location"] ?? 9);
      if (kindDiff) return kindDiff;
      return (adjacency.get(b)?.size ?? 0) - (adjacency.get(a)?.size ?? 0);
    });
    return new Set([id, ...orderedNeighbors.slice(0, limit - 1)]);
  }

  function seedFrom(id: string) {
    setRevealedIds(focusedNeighborhood(id));
    setSelectedId(id);
    setMode("explore");
    setPathIds(null);
  }

  function centerGraph(id: string) {
    if (queryFocusId !== id) {
      navigate(`?focusId=${encodeURIComponent(id)}`);
    } else {
      seedFrom(id);
    }
  }

  function expand(id: string) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      const remaining = Math.max(0, MAX_EXPLORE_NODES - next.size);
      Array.from(adjacency.get(id) ?? [])
        .filter((n) => !next.has(n))
        .sort((a, b) => (adjacency.get(b)?.size ?? 0) - (adjacency.get(a)?.size ?? 0))
        .slice(0, remaining)
        .forEach((n) => next.add(n));
      return next;
    });
  }

  // Auto-seed the top key player on first load so the canvas opens on a readable
  // neighbourhood rather than an empty prompt.
  useEffect(() => {
    if (loading || seeded) return;
    if (queryFocusId && nodeById.has(queryFocusId)) {
      seedFrom(queryFocusId);
    } else if (hubs.length > 0) {
      seedFrom(hubs[0].id);
    }
    setSeeded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, seeded, hubs, adjacency, queryFocusId, nodeById]);

  function onNodeClick(id: string) {
    if (mode === "path") {
      // In path mode a click assigns an endpoint (From first, then To)
      if (!pathFromId || (pathFromId && pathToId)) {
        setPathFromId(id);
        setPathToId(null);
        setPathIds(null);
        setPathError(null);
      } else {
        runPath(pathFromId, id);
      }
      setSelectedId(id);
      return;
    }
    setSelectedId(id === selectedId ? null : id);
    expand(id);
  }

  function runPath(from: string, to: string) {
    setPathToId(to);
    const path = shortestPath(edges, from, to);
    if (!path) {
      setPathIds(null);
      setPathError("No connection found between these two entities.");
      setRevealedIds(new Set([from, to]));
      return;
    }
    setPathError(null);
    setPathIds(path);
    setRevealedIds(new Set(path));
  }

  function resetPath() {
    setPathFromId(null);
    setPathToId(null);
    setPathIds(null);
    setPathError(null);
  }

  function revealRing(ring: Ring) {
    const focus = ring.nodeIds.find((id) => nodeById.get(id)?.kind === "Person") ?? ring.nodeIds[0];
    if (focus) seedFrom(focus);
  }

  function togglePin(id: string) {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Search suggestions (entities matching the query)
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return nodes.filter((n) => n.label.toLowerCase().includes(q)).slice(0, 8);
  }, [query, nodes]);

  // Which nodes are actually drawn: revealed ∩ active-kind filters
  const visibleRawNodes = useMemo(
    () => nodes.filter((n) => revealedIds.has(n.id) && activeKinds[n.kind]),
    [nodes, revealedIds, activeKinds]
  );
  const visibleIdSet = useMemo(() => new Set(visibleRawNodes.map((n) => n.id)), [visibleRawNodes]);
  const visibleEdges = useMemo(
    () => edges.filter((e) => visibleIdSet.has(e.from) && visibleIdSet.has(e.to)),
    [edges, visibleIdSet]
  );

  // Layout only the small revealed subset; recompute whenever it changes.
  const positioned = useMemo(() => layoutGraph(visibleRawNodes, visibleEdges), [visibleRawNodes, visibleEdges]);
  const posById = useMemo(() => new Map(positioned.map((n) => [n.id, n])), [positioned]);

  const focusId = hoverId ?? selectedId;
  const connectedToFocus = useMemo(() => {
    if (!focusId) return null;
    const s = new Set<string>([focusId]);
    (adjacency.get(focusId) ?? new Set<string>()).forEach((n) => s.add(n));
    return s;
  }, [focusId, adjacency]);

  const pathEdgeSet = useMemo(() => {
    if (!pathIds) return null;
    const s = new Set<string>();
    for (let i = 0; i < pathIds.length - 1; i++) {
      s.add([pathIds[i], pathIds[i + 1]].sort().join("|"));
    }
    return s;
  }, [pathIds]);

  // A node is expandable when it has neighbours the canvas isn't showing yet.
  const expandableIds = useMemo(() => {
    if (mode !== "explore") return new Set<string>();
    const shownDegree = new Map<string, number>();
    for (const e of visibleEdges) {
      shownDegree.set(e.from, (shownDegree.get(e.from) ?? 0) + 1);
      shownDegree.set(e.to, (shownDegree.get(e.to) ?? 0) + 1);
    }
    const ids = new Set<string>();
    for (const n of positioned) {
      if ((adjacency.get(n.id)?.size ?? 0) > (shownDegree.get(n.id) ?? 0)) ids.add(n.id);
    }
    return ids;
  }, [mode, positioned, visibleEdges, adjacency]);

  const selected = selectedId ? nodeById.get(selectedId) ?? null : null;
  const visibleFocus = selected ?? (revealedIds.size ? nodeById.get(Array.from(revealedIds)[0]) ?? null : null);

  const kindCounts = useMemo(() => {
    const c: Record<NodeKind, number> = { Case: 0, Vehicle: 0, Person: 0, Location: 0 };
    for (const n of visibleRawNodes) c[n.kind]++;
    return c;
  }, [visibleRawNodes]);

  /** Court-file style PDF of the pinned entities + a snapshot of the current canvas. */
  async function exportBoardPdf() {
    setExporting(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const marginX = 14;
      let y = 20;

      doc.setFontSize(15);
      doc.setTextColor(11, 27, 43);
      doc.text("SCRB SAHAYAK - NETWORK EVIDENCE BOARD", marginX, y);
      y += 6;
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`Generated: ${new Date().toLocaleString()} · Leads only — confirm before filing`, marginX, y);
      y += 4;
      doc.setDrawColor(46, 143, 143);
      doc.setLineWidth(0.5);
      doc.line(marginX, y + 2, pageWidth - marginX, y + 2);
      y += 10;

      const ensureSpace = (needed: number) => {
        if (y + needed > 275) {
          doc.addPage();
          y = 20;
        }
      };

      const pinned = nodes.filter((n) => pinnedIds.has(n.id));
      doc.setFontSize(11);
      doc.setTextColor(0);
      doc.setFont("helvetica", "bold");
      doc.text(`Pinned entities (${pinned.length})`, marginX, y);
      y += 6;

      for (const n of pinned) {
        ensureSpace(14);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(`${n.label}  [${n.kind}${n.sub ? ` · ${n.sub}` : ""}]`, marginX, y);
        y += 4.5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(80);
        if (n.detail) {
          doc.text(n.detail, marginX + 3, y);
          y += 4;
        }
        if (n.date) {
          doc.text(`Incident date: ${n.date}`, marginX + 3, y);
          y += 4;
        }
        const links = edges.filter((e) => e.from === n.id || e.to === n.id);
        for (const e of links.slice(0, 8)) {
          ensureSpace(4.5);
          const otherId = e.from === n.id ? e.to : e.from;
          const other = nodeById.get(otherId);
          if (!other) continue;
          doc.text(`- ${e.label} -> ${other.label} (${other.kind})`, marginX + 3, y);
          y += 4;
        }
        doc.setTextColor(0);
        y += 2.5;
      }

      if (pathIds && pathIds.length > 1) {
        ensureSpace(12);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Traced connection chain", marginX, y);
        y += 6;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        const chain = pathIds.map((id) => nodeById.get(id)?.label ?? id).join("  ->  ");
        const lines: string[] = doc.splitTextToSize(chain, pageWidth - marginX * 2);
        for (const line of lines) {
          ensureSpace(4.5);
          doc.text(line, marginX, y);
          y += 4.5;
        }
        y += 3;
      }

      // Canvas snapshot: redraw the currently revealed subgraph into the PDF from
      // the same layout coordinates the screen uses, so it's vector-crisp.
      if (positioned.length > 0) {
        ensureSpace(105);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Canvas snapshot (current view)", marginX, y);
        y += 5;
        const boxW = pageWidth - marginX * 2;
        const boxH = 90;
        doc.setDrawColor(200);
        doc.rect(marginX, y, boxW, boxH);
        const px = (v: number) => marginX + (v / 100) * boxW;
        const py = (v: number) => y + (v / 100) * boxH;
        doc.setDrawColor(150);
        doc.setLineWidth(0.2);
        for (const e of visibleEdges) {
          const a = posById.get(e.from);
          const b = posById.get(e.to);
          if (!a || !b) continue;
          doc.line(px(a.x), py(a.y), px(b.x), py(b.y));
        }
        doc.setFontSize(6.5);
        for (const n of positioned) {
          const fill: [number, number, number] =
            n.kind === "Case" ? [201, 122, 31] : n.kind === "Person" ? [102, 80, 196] : n.kind === "Vehicle" ? [61, 124, 136] : [76, 140, 70];
          doc.setFillColor(...fill);
          doc.circle(px(n.x), py(n.y), pinnedIds.has(n.id) ? 2.4 : 1.6, "F");
          doc.setTextColor(60);
          doc.text(n.label.slice(0, 18), px(n.x) + 2.5, py(n.y) + 1);
        }
        y += boxH + 6;
      }

      doc.save(`Network_Board_${Date.now()}.pdf`);

      await apiRequest("/api/audit", {
        method: "POST",
        body: JSON.stringify({
          action: "EXPORT_NETWORK_PDF",
          targetType: "NETWORK",
          details: `Exported evidence board: ${pinned.length} pinned, ${positioned.length} in view`,
        }),
      });
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  }

  /**
   * Deterministic operational brief computed from graph metrics (no LLM needed),
   * seeded into the Copilot so follow-up questions are grounded in this view.
   */
  function briefCopilot() {
    const nodeLabelById = new Map(nodes.map((n) => [n.id, n.label]));
    const markdown = buildNetworkBrief({
      visibleNodes: visibleRawNodes,
      visibleEdges,
      rings,
      hubs,
      brokers,
      tracedChain: pathIds,
      nodeLabelById,
    });
    pushNetworkBriefToCopilot(
      markdown,
      `Officer is reviewing the entity network canvas. In view: ${visibleRawNodes
        .map((n) => `${n.kind}:${n.label}`)
        .slice(0, 30)
        .join(", ")}`
    );
    navigate("/dashboard");
  }

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8">
        <Card strong className="relative overflow-hidden p-5 flex flex-col items-center justify-center h-[calc(100vh-10rem)]">
          <Skeleton className="h-16 w-16 rounded-full" />
        </Card>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8">
        <Card strong className="p-8 text-center">
          <CircleAlert className="mx-auto h-6 w-6 text-danger" />
          <p className="mt-3 text-sm font-medium">The network could not be loaded.</p>
          <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
          <Button className="mt-4" variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
            Try again
          </Button>
        </Card>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8">
        <Card strong className="relative overflow-hidden p-5 flex flex-col items-center justify-center h-[calc(100vh-10rem)]">
          <Layers className="h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No linked cases, persons, or vehicles found yet for your jurisdiction.</p>
          <p className="mt-1 text-xs text-muted-foreground">Upload an FIR or confirm a lead to start building the network.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8">
      {/* Canvas */}
      <Card strong className="relative overflow-hidden p-5 flex flex-col h-[calc(100vh-10rem)]">
        <div className="flex flex-wrap items-start justify-between gap-3 shrink-0">
          <div className="max-w-xl">
            <SectionLabel className="mb-2">Investigation network</SectionLabel>
            <h1 className="text-display text-2xl">Trace links that matter to this investigation.</h1>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Start with a case or person. Clusters use FIR-recorded relationships and officer-confirmed matches; pending AI suggestions remain separate for review.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <div className="glass inline-flex rounded-2xl p-1">
              <button
                onClick={() => {
                  setMode("explore");
                  resetPath();
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition",
                  mode === "explore" ? "bg-muted text-foreground shadow-inner" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Compass className="h-3.5 w-3.5" /> {t("network.explore")}
              </button>
              <button
                onClick={() => {
                  setMode("path");
                  resetPath();
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition",
                  mode === "path" ? "bg-teal/10 text-teal shadow-inner" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Route className="h-3.5 w-3.5" /> {t("network.findPath")}
              </button>
            </div>
            <button
              onClick={briefCopilot}
              disabled={revealedIds.size === 0}
              title="Generate an operational brief from this view and open it in the Copilot"
              className="inline-flex items-center gap-1.5 rounded-2xl border border-teal/25 bg-teal/10 px-3 py-2 text-xs font-medium text-teal transition hover:bg-teal/15 disabled:opacity-40"
            >
              <Sparkles className="h-3.5 w-3.5" /> {t("network.briefCopilot")}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 shrink-0">
          {[
            { label: "Cases in scope", value: meta.caseCount },
            { label: "Shared entities", value: meta.sharedEntityCount },
            { label: "Verified links", value: meta.verifiedLinkCount },
            { label: "Unverified leads", value: meta.pendingLeadCount },
          ].map((metric) => (
            <div key={metric.label} className="rounded-xl border border-hairline bg-surface-2 px-3 py-2">
              <p className="text-mono text-[9px] uppercase tracking-wider text-muted-foreground">{metric.label}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{metric.value}</p>
            </div>
          ))}
        </div>

        {/* Search (explore mode only) */}
        {mode === "explore" && (
          <div className="relative mt-4 shrink-0 max-w-xl">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Focus on a FIR, person, or vehicle…"
              className="w-full rounded-xl border border-hairline bg-surface py-2 pr-3 pl-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/25 focus:outline-none"
            />
            {searchResults.length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-xl border border-hairline bg-surface p-1 shadow-lg">
                {searchResults.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      seedFrom(n.id);
                      setQuery("");
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: KIND_STYLE[n.kind].dot }} />
                    <span className="truncate font-medium text-foreground">{n.label}</span>
                    <span className="text-mono ml-auto shrink-0 text-[10px] text-muted-foreground">{n.kind}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {mode === "explore" && visibleFocus && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-teal/20 bg-teal/5 px-3 py-2 text-xs shrink-0">
            <Link2 className="h-3.5 w-3.5 shrink-0 text-teal" />
            <span className="text-muted-foreground">Focused view:</span>
            <span className="font-medium text-foreground">{visibleFocus.label}</span>
            <span className="text-muted-foreground">· click a node to inspect its direct evidence</span>
          </div>
        )}

        {/* Path controls */}
        {mode === "path" && (
          <div className="mt-3 shrink-0 rounded-xl border border-hairline bg-surface-2 p-3">
            <p className="text-[11px] text-muted-foreground mb-2">
              Pick two entities to reveal how they connect. Click nodes on the canvas, or search below.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <PathPicker
                label="From"
                nodes={nodes}
                valueId={pathFromId}
                onPick={(id) => {
                  setPathFromId(id);
                  if (pathToId) runPath(id, pathToId);
                }}
              />
              <PathPicker
                label="To"
                nodes={nodes}
                valueId={pathToId}
                onPick={(id) => {
                  setPathToId(id);
                  if (pathFromId) runPath(pathFromId, id);
                }}
              />
            </div>
            {pathError && <p className="mt-2 text-[11px] text-danger">{pathError}</p>}
            {pathIds && (
              <p className="mt-2 text-[11px] text-teal">
                Connected in {pathIds.length - 1} link{pathIds.length - 1 > 1 ? "s" : ""}.
              </p>
            )}
          </div>
        )}

        <div className="relative mt-4 flex-1 w-full overflow-hidden rounded-3xl border border-hairline bg-surface-2">
          <NetworkCanvas
            positioned={positioned}
            visibleEdges={visibleEdges}
            focusId={focusId}
            connectedToFocus={connectedToFocus}
            pathIds={pathIds}
            pathEdgeSet={pathEdgeSet}
            expandableIds={expandableIds}
            emptyHint={mode === "path" ? "Pick two entities to trace a connection." : "Choose a cross-case entity or search for a case to begin."}
            onNodeClick={onNodeClick}
            onNodeHover={setHoverId}
          />

          {/* Legend */}
          <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-1.5 rounded-2xl border border-hairline bg-surface/90 p-1.5 shadow-sm backdrop-blur">
            {(Object.keys(KIND_STYLE) as NodeKind[]).map((k) => {
              const s = KIND_STYLE[k];
              const active = activeKinds[k];
              return (
                <button
                  key={k}
                  onClick={() => setActiveKinds((p) => ({ ...p, [k]: !p[k] }))}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-[11px] font-medium transition",
                    active ? "hover:bg-muted" : "opacity-40"
                  )}
                >
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.dot }} />
                  {s.label}
                  <span className="text-mono text-[10px] text-muted-foreground">{kindCounts[k]}</span>
                </button>
              );
            })}
          </div>

          {/* Stats chip */}
          <div className="absolute top-4 right-4 flex items-center gap-2 rounded-2xl border border-hairline bg-surface/90 px-3 py-1.5 text-[11px] shadow-sm backdrop-blur">
            <Activity className="h-3 w-3 text-amber" />
            <span className="text-mono text-muted-foreground">
              {positioned.length} in focus · {nodes.length} records
            </span>
          </div>
        </div>
      </Card>

      {/* Right rail */}
      <div className="flex flex-col gap-4 overflow-y-auto">
        <KeyPlayersPanel
          hubs={hubs}
          brokers={brokers}
          tab={playerTab}
          onTabChange={setPlayerTab}
          selectedId={selectedId}
          onSelect={centerGraph}
        />

        {meta.pendingLeadCount > 0 && (
          <Card className="border-amber/20 bg-amber/5 p-4 shrink-0">
            <div className="flex items-start gap-2.5">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
              <div>
                <p className="text-xs font-medium text-foreground">{meta.pendingLeadCount} unverified similarity leads</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  These machine-generated suggestions are deliberately excluded from hubs and clusters until an officer confirms them.
                </p>
                <button
                  type="button"
                  onClick={() => setShowLeads((current) => !current)}
                  className="mt-2 text-[11px] font-medium text-amber hover:underline"
                >
                  {showLeads ? "Hide suggestions" : "Review top suggestions"}
                </button>
              </div>
            </div>
            {showLeads && (
              <div className="mt-3 space-y-1.5 border-t border-amber/15 pt-3">
                {[...leadEdges]
                  .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
                  .slice(0, 4)
                  .map((lead, index) => {
                    const from = nodeById.get(lead.from);
                    const to = nodeById.get(lead.to);
                    if (!from || !to) return null;
                    return (
                      <button
                        key={`${lead.from}-${lead.to}-${index}`}
                        type="button"
                        onClick={() => centerGraph(lead.from)}
                        className="block w-full rounded-lg border border-amber/15 bg-surface px-2.5 py-2 text-left transition hover:bg-amber/10"
                      >
                        <p className="truncate text-[11px] font-medium text-foreground">{from.label} → {to.label}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{lead.label}</p>
                      </button>
                    );
                  })}
              </div>
            )}
          </Card>
        )}

        <RingsPanel rings={rings} onRevealRing={revealRing} />

        <SelectionPanel
          node={selected}
          edges={edges}
          nodeById={nodeById}
          degree={selected ? neighborsOf(selected.id).size : 0}
          canExpand={!!selected && mode === "explore" && expandableIds.has(selected.id)}
          pinned={!!selected && pinnedIds.has(selected.id)}
          onExpand={expand}
          onFocus={centerGraph}
          onTogglePin={togglePin}
          onSelectOther={onNodeClick}
          onClear={() => setSelectedId(null)}
        />

        <EvidenceBoardPanel
          pinnedNodes={nodes.filter((n) => pinnedIds.has(n.id))}
          onFocus={centerGraph}
          onUnpin={togglePin}
          onExport={exportBoardPdf}
          exporting={exporting}
        />

        {mode === "path" && pathIds && pathIds.length > 0 && (
          <ConnectionChainPanel pathIds={pathIds} edges={edges} nodeById={nodeById} />
        )}
      </div>
    </div>
  );
}

function PathPicker({
  label,
  nodes,
  valueId,
  onPick,
}: {
  label: string;
  nodes: GraphNode[];
  valueId: string | null;
  onPick: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const current = valueId ? nodes.find((n) => n.id === valueId) : null;
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return nodes.filter((n) => n.label.toLowerCase().includes(s)).slice(0, 6);
  }, [q, nodes]);

  return (
    <div className="relative">
      <label className="text-mono text-[9px] tracking-widest text-muted-foreground uppercase">{label}</label>
      <input
        value={open ? q : current?.label ?? q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search…"
        className="mt-0.5 w-full rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground focus:border-foreground/25 focus:outline-none"
      />
      {open && results.length > 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-hairline bg-surface p-1 shadow-lg">
          {results.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                onPick(n.id);
                setOpen(false);
                setQ("");
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-muted"
            >
              <span className="truncate font-medium text-foreground">{n.label}</span>
              <span className="text-mono ml-auto shrink-0 text-[9px] text-muted-foreground">{n.kind}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
