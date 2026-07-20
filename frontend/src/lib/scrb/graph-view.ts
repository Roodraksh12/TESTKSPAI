// Thin client-side graph helpers over the payload already fetched from
// GET /api/network. The heavy math (rings, betweenness) is computed once,
// server-side, and shipped with the graph — this file only does BFS over
// whatever is already loaded, so expand/path-find are instant with no
// extra round trips.

export type NodeKind = "Case" | "Person" | "Vehicle" | "Location";

export type GraphNode = {
  id: string;
  label: string;
  kind: NodeKind;
  sub?: string | null;
  detail?: string | null;
  date?: string | null;
};

export type GraphEdge = { from: string; to: string; label: string };

/** A node with layout coordinates assigned, in a 0–100 percentage box. */
export type PositionedNode = GraphNode & { x: number; y: number };

export function buildAdjacency(edges: GraphEdge[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Set());
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, new Set());
    adjacency.get(edge.from)!.add(edge.to);
    adjacency.get(edge.to)!.add(edge.from);
  }
  return adjacency;
}

export function neighborhood(edges: GraphEdge[], seedId: string, hops: number): Set<string> {
  const adjacency = buildAdjacency(edges);
  const visited = new Set<string>([seedId]);
  let frontier = new Set<string>([seedId]);
  for (let i = 0; i < hops; i++) {
    const next = new Set<string>();
    for (const nodeId of frontier) {
      for (const neighbour of adjacency.get(nodeId) ?? []) {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          next.add(neighbour);
        }
      }
    }
    if (next.size === 0) break;
    frontier = next;
  }
  return visited;
}

export function shortestPath(edges: GraphEdge[], from: string, to: string): string[] | null {
  if (from === to) return [from];
  const adjacency = buildAdjacency(edges);
  if (!adjacency.has(from) || !adjacency.has(to)) return null;

  const queue: string[] = [from];
  const cameFrom = new Map<string, string>();
  const visited = new Set<string>([from]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbour of adjacency.get(current) ?? []) {
      if (visited.has(neighbour)) continue;
      visited.add(neighbour);
      cameFrom.set(neighbour, current);
      if (neighbour === to) {
        const path = [to];
        let node = to;
        while (node !== from) {
          node = cameFrom.get(node)!;
          path.push(node);
        }
        return path.reverse();
      }
      queue.push(neighbour);
    }
  }
  return null;
}

/**
 * Deterministic Fruchterman–Reingold-style force layout in a 0–100 coordinate
 * box. Run on the small revealed subset (tens of nodes) each time it changes,
 * so the visible neighbourhood always clusters neatly around what's on screen
 * rather than being scattered across a full-graph layout.
 *
 * The seeded RNG keeps the layout stable across renders — the same subgraph
 * always lands in the same arrangement, so the canvas doesn't reshuffle itself
 * while an officer is reading it.
 */
export function layoutGraph(rawNodes: GraphNode[], edges: GraphEdge[]): PositionedNode[] {
  const n = rawNodes.length;
  if (n === 0) return [];
  if (n === 1) return [{ ...rawNodes[0], x: 50, y: 50 }];

  const idToIndex = new Map(rawNodes.map((node, i) => [node.id, i]));

  let seed = 42;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const pos = rawNodes.map((_, i) => {
    const angle = (i / n) * Math.PI * 2;
    const radius = 20 + rand() * 10;
    return { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius };
  });

  const edgeIdx = edges
    .map((e) => ({ a: idToIndex.get(e.from), b: idToIndex.get(e.to) }))
    .filter((e): e is { a: number; b: number } => e.a !== undefined && e.b !== undefined && e.a !== e.b);

  const ITER = 250;
  const AREA = 100;
  const k = Math.sqrt((AREA * AREA) / n) * 0.9;

  for (let iter = 0; iter < ITER; iter++) {
    const disp = pos.map(() => ({ x: 0, y: 0 }));

    // Repulsion: every node pushes every other node away.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (k * k) / dist;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        disp[i].x += fx;
        disp[i].y += fy;
        disp[j].x -= fx;
        disp[j].y -= fy;
      }
    }

    // Attraction: linked nodes pull together.
    for (const { a, b } of edgeIdx) {
      const dx = pos[a].x - pos[b].x;
      const dy = pos[a].y - pos[b].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (dist * dist) / k;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      disp[a].x -= fx;
      disp[a].y -= fy;
      disp[b].x += fx;
      disp[b].y += fy;
    }

    // Cooling schedule + a gentle pull toward centre so nothing drifts off-canvas.
    const temp = Math.max(0.5, 10 * (1 - iter / ITER));
    for (let i = 0; i < n; i++) {
      const dLen = Math.sqrt(disp[i].x ** 2 + disp[i].y ** 2) || 0.01;
      pos[i].x += (disp[i].x / dLen) * Math.min(dLen, temp);
      pos[i].y += (disp[i].y / dLen) * Math.min(dLen, temp);
      pos[i].x += (50 - pos[i].x) * 0.005;
      pos[i].y += (50 - pos[i].y) * 0.005;
    }
  }

  // Normalise into an 8–92 box so labels near the edge stay readable.
  const xs = pos.map((p) => p.x);
  const ys = pos.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);

  return rawNodes.map((node, i) => ({
    ...node,
    x: 8 + ((pos[i].x - minX) / spanX) * 84,
    y: 8 + ((pos[i].y - minY) / spanY) * 84,
  }));
}
