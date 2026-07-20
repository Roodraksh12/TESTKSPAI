import { useCopilotStore } from "@/lib/store";
import type { GraphEdge, GraphNode } from "./graph-view";

type Ring = { id: string; label: string; caseCount: number; personCount: number; vehicleCount: number };
type KeyPlayer = { id: string; label: string; kind: string; degree?: number; betweenness?: number; breakdown?: string };

// "Brief Copilot" — composes a brief from graph metrics already in view.
// No LLM call: works even with no OpenRouter key configured.
export function buildNetworkBrief(opts: {
  visibleNodes: GraphNode[];
  visibleEdges: GraphEdge[];
  rings: Ring[];
  hubs: KeyPlayer[];
  brokers: KeyPlayer[];
  tracedChain?: string[] | null;
  nodeLabelById: Map<string, string>;
}): string {
  const { visibleNodes, visibleEdges, rings, hubs, brokers, tracedChain, nodeLabelById } = opts;

  const caseCount = visibleNodes.filter((n) => n.kind === "Case").length;
  const personCount = visibleNodes.filter((n) => n.kind === "Person").length;
  const vehicleCount = visibleNodes.filter((n) => n.kind === "Vehicle").length;

  const lines: string[] = [];
  lines.push("## Network Brief");
  lines.push("");
  lines.push(
    `Currently viewing **${visibleNodes.length} entities** (${caseCount} cases, ${personCount} people, ${vehicleCount} vehicles) linked by **${visibleEdges.length} connections**.`
  );

  if (hubs[0]) {
    lines.push(`\n**Top hub:** ${hubs[0].label} — ${hubs[0].breakdown || `${hubs[0].degree} direct links`}.`);
  }
  if (brokers[0]) {
    lines.push(
      `**Top broker:** ${brokers[0].label} — sits on the most shortest paths between others. Hubs are the busiest; brokers hold the network together, so this is often the higher arrest priority even when it isn't the busiest node.`
    );
  }
  if (rings.length > 0) {
    lines.push(
      `\n**Detected rings:** ${rings.length}. Largest is "${rings[0].label}", spanning ${rings[0].caseCount} cases, ${rings[0].personCount} people, ${rings[0].vehicleCount} vehicles.`
    );
  } else {
    lines.push("\nNo multi-case rings detected in the current jurisdiction.");
  }

  if (tracedChain && tracedChain.length > 1) {
    const chainLabels = tracedChain.map((id) => nodeLabelById.get(id) || id);
    lines.push(`\n**Traced path:** ${chainLabels.join(" → ")}.`);
  }

  lines.push("\n_Computed directly from the network graph — no model call._");
  return lines.join("\n");
}

export function pushNetworkBriefToCopilot(markdown: string, pageContext: string): void {
  const store = useCopilotStore.getState();
  store.setChatHistory([{ role: "assistant", content: markdown, kind: "intake" }]);
  store.setPageContext(pageContext);
  store.setIntakeActionPrompts([
    "Which of these cases risk default bail?",
    "Summarise the top broker's connections",
    "Show identity leads for the top hub",
  ]);
  store.setIsOpen(true);
}
