import { Link } from "react-router-dom";
import { Layers, X, Pin, FileDown, ExternalLink, Users } from "lucide-react";
import { Badge, Card, SectionLabel } from "@/components/scrb/primitives";
import { KIND_STYLE } from "@/components/scrb/network-canvas";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { GraphEdge, GraphNode } from "@/lib/scrb/graph-view";

export type Ring = { id: string; label: string; nodeIds: string[]; caseCount: number; personCount: number; vehicleCount: number };
export type KeyPlayer = { id: string; label: string; kind: string; degree?: number; betweenness?: number; breakdown?: string };

export function KeyPlayersPanel({
  hubs,
  brokers,
  tab,
  onTabChange,
  selectedId,
  onSelect,
}: {
  hubs: KeyPlayer[];
  brokers: KeyPlayer[];
  tab: "hubs" | "brokers";
  onTabChange: (tab: "hubs" | "brokers") => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  const list = tab === "hubs" ? hubs : brokers;

  return (
    <Card accent="amber" className="p-5 shrink-0">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>{t("network.keyPlayers")}</SectionLabel>
        <div className="glass inline-flex rounded-xl p-0.5">
          <button
            onClick={() => onTabChange("hubs")}
            title="Most directly-connected entities"
            className={cn(
              "rounded-lg px-2 py-1 text-[10px] font-medium transition",
              tab === "hubs" ? "bg-muted text-foreground shadow-inner" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Hubs
          </button>
          <button
            onClick={() => onTabChange("brokers")}
            title="Bridge entities holding separate groups together (betweenness)"
            className={cn(
              "rounded-lg px-2 py-1 text-[10px] font-medium transition",
              tab === "brokers" ? "bg-muted text-foreground shadow-inner" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Brokers
          </button>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {tab === "hubs"
            ? "No multi-case entities yet."
            : "No bridge entities yet — brokers appear when separate groups share a go-between."}
        </p>
      ) : (
        <div className="space-y-1.5">
          {list.map((kp, i) => {
            const s = KIND_STYLE[kp.kind as keyof typeof KIND_STYLE] ?? KIND_STYLE.Location;
            return (
              <button
                key={kp.id}
                onClick={() => onSelect(kp.id)}
                className={cn(
                  "group flex w-full items-center gap-2.5 rounded-2xl border border-hairline bg-surface px-3 py-2 text-left transition hover:bg-muted",
                  selectedId === kp.id && "border-foreground/25"
                )}
              >
                <span className="text-mono text-[10px] text-muted-foreground w-3 shrink-0">{i + 1}</span>
                <span className="h-6 w-6 shrink-0 flex items-center justify-center rounded-lg" style={{ background: s.fill }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: s.dot }} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-foreground">{kp.label}</p>
                  <p className="text-mono text-[10px] text-muted-foreground truncate">{kp.breakdown}</p>
                </div>
                <span className="text-mono text-[11px] font-semibold text-amber shrink-0">{kp.degree}</span>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function RingsPanel({ rings, onRevealRing }: { rings: Ring[]; onRevealRing: (ring: Ring) => void }) {
  const { t } = useI18n();
  return (
    <Card className="p-5 shrink-0">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>{t("network.detectedRings")}</SectionLabel>
        <Badge tone="muted">{rings.length}</Badge>
      </div>
      {rings.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No multi-case clusters yet — rings appear when 2+ cases share people or vehicles.
        </p>
      ) : (
        <div className="space-y-1.5">
          {rings.slice(0, 5).map((r, i) => (
            <button
              key={r.id}
              onClick={() => onRevealRing(r)}
              className="group flex w-full items-center gap-2.5 rounded-2xl border border-hairline bg-surface px-3 py-2 text-left transition hover:bg-muted"
            >
              <span className="h-6 w-6 shrink-0 flex items-center justify-center rounded-lg bg-danger/10 text-danger">
                <Users className="h-3 w-3" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-foreground">
                  Ring {String.fromCharCode(65 + i)} · {r.label}
                </p>
                <p className="text-mono text-[10px] text-muted-foreground truncate">
                  {r.caseCount} cases · {r.personCount} people
                  {r.vehicleCount ? ` · ${r.vehicleCount} vehicle${r.vehicleCount > 1 ? "s" : ""}` : ""}
                </p>
              </div>
              <span className="text-mono text-[10px] text-muted-foreground shrink-0">{r.nodeIds.length} nodes</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

export function SelectionPanel({
  node,
  edges,
  nodeById,
  degree,
  canExpand,
  pinned,
  onExpand,
  onFocus,
  onTogglePin,
  onSelectOther,
  onClear,
}: {
  node: GraphNode | null;
  edges: GraphEdge[];
  nodeById: Map<string, GraphNode>;
  degree: number;
  canExpand: boolean;
  pinned: boolean;
  onExpand: (id: string) => void;
  onFocus: (id: string) => void;
  onTogglePin: (id: string) => void;
  onSelectOther: (id: string) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  return (
    <Card accent="teal" className="p-5 shrink-0">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>{t("network.selection")}</SectionLabel>
        {node && (
          <button onClick={onClear} className="rounded-full p-1 text-muted-foreground hover:bg-muted">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {!node ? (
        <div className="mt-2 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-hairline bg-surface-2 py-6 text-center">
          <Layers className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground px-3">Tap a node to inspect it. In Explore mode, tapping also reveals its links.</p>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: KIND_STYLE[node.kind].dot }} />
            <SectionLabel className="mb-1">{node.kind}</SectionLabel>
          </div>
          <p className="text-display mt-1 text-lg leading-tight">{node.label}</p>
          {node.sub && <p className="text-xs text-muted-foreground">{node.sub}</p>}
          {node.detail && <p className="mt-1 text-mono text-[11px] text-muted-foreground">{node.detail}</p>}
          {node.date && <p className="mt-1 text-mono text-[11px] text-muted-foreground">Incident: {node.date}</p>}
          <p className="mt-2 text-xs text-muted-foreground">{degree} direct link(s).</p>

          {node.kind === "Case" && (
            <Link
              to={`/cases/${node.id.replace(/^case:/, "")}`}
              className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-amber/10 border border-amber/20 px-3 py-2 text-[11px] font-medium text-amber hover:bg-amber/15"
            >
              Open case dossier <ExternalLink className="h-3 w-3" />
            </Link>
          )}

          <div className="mt-3 flex gap-2">
            {canExpand && (
              <button
                onClick={() => onExpand(node.id)}
                className="flex-1 rounded-xl border border-hairline bg-surface px-3 py-1.5 text-[11px] font-medium hover:bg-muted"
              >
                Expand links
              </button>
            )}
            <button
              onClick={() => onFocus(node.id)}
              className="flex-1 rounded-xl border border-hairline bg-surface px-3 py-1.5 text-[11px] font-medium hover:bg-muted"
            >
              Focus here
            </button>
            <button
              onClick={() => onTogglePin(node.id)}
              title={pinned ? "Remove from evidence board" : "Pin to evidence board"}
              className={cn(
                "flex items-center justify-center gap-1 rounded-xl border px-3 py-1.5 text-[11px] font-medium transition",
                pinned ? "border-teal/30 bg-teal/10 text-teal" : "border-hairline bg-surface hover:bg-muted"
              )}
            >
              <Pin className="h-3 w-3" />
              {pinned ? "Pinned" : "Pin"}
            </button>
          </div>

          <div className="mt-4 space-y-1.5 max-h-[220px] overflow-y-auto custom-scrollbar">
            <SectionLabel className="mb-2">{t("network.connections")}</SectionLabel>
            {edges
              .filter((e) => e.from === node.id || e.to === node.id)
              .map((e, i) => {
                const otherId = e.from === node.id ? e.to : e.from;
                const other = nodeById.get(otherId);
                if (!other) return null;
                const s = KIND_STYLE[other.kind];
                return (
                  <button
                    key={i}
                    onClick={() => onSelectOther(other.id)}
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
    </Card>
  );
}

export function EvidenceBoardPanel({
  pinnedNodes,
  onFocus,
  onUnpin,
  onExport,
  exporting,
}: {
  pinnedNodes: GraphNode[];
  onFocus: (id: string) => void;
  onUnpin: (id: string) => void;
  onExport: () => void;
  exporting: boolean;
}) {
  const { t } = useI18n();
  if (pinnedNodes.length === 0) return null;

  return (
    <Card accent="teal" className="p-5 shrink-0">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>{t("network.evidenceBoard")}</SectionLabel>
        <Badge tone="teal">{pinnedNodes.length} pinned</Badge>
      </div>
      <div className="space-y-1.5">
        {pinnedNodes.map((n) => {
          const s = KIND_STYLE[n.kind];
          return (
            <div key={n.id} className="flex items-center gap-2 rounded-2xl border border-hairline bg-surface px-3 py-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.dot }} />
              <button
                onClick={() => onFocus(n.id)}
                className="min-w-0 flex-1 truncate text-left text-[11px] font-medium text-foreground hover:underline"
              >
                {n.label}
              </button>
              <button
                onClick={() => onUnpin(n.id)}
                className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted"
                aria-label={`Unpin ${n.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
      <button
        onClick={onExport}
        disabled={exporting}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-ink text-white dark:bg-foreground dark:text-background px-3 py-2 text-[11px] font-medium transition hover:opacity-90 disabled:opacity-50"
      >
        <FileDown className="h-3.5 w-3.5" /> {exporting ? t("copilot.exporting") : t("network.exportBoard")}
      </button>
    </Card>
  );
}

export function ConnectionChainPanel({
  pathIds,
  edges,
  nodeById,
}: {
  pathIds: string[];
  edges: GraphEdge[];
  nodeById: Map<string, GraphNode>;
}) {
  const { t } = useI18n();
  return (
    <Card className="p-5 shrink-0">
      <SectionLabel className="mb-3">{t("network.connectionChain")}</SectionLabel>
      <ol className="space-y-2">
        {pathIds.map((id, i) => {
          const n = nodeById.get(id);
          if (!n) return null;
          const s = KIND_STYLE[n.kind];
          const linkLabel =
            i < pathIds.length - 1
              ? edges.find(
                  (e) =>
                    (e.from === id && e.to === pathIds[i + 1]) || (e.to === id && e.from === pathIds[i + 1])
                )?.label
              : null;
          return (
            <li key={id}>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.dot }} />
                <span className="text-[12px] font-medium text-foreground">{n.label}</span>
              </div>
              {linkLabel && (
                <div className="ml-1 my-0.5 border-l border-dashed border-hairline pl-3 text-[10px] text-mono text-muted-foreground">
                  ↓ {linkLabel}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
