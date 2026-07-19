# Cross-Case Linkage Module

## Overview
The Cross-Case Linkage Canvas (located in the `/network` route) is an advanced visual analytics tool that allows investigators to detect hidden relationships between seemingly isolated crimes. It shifts the paradigm from reading text-heavy FIRs to visually mapping extracted entities across the entire jurisdiction.

## Key Features
- **Entity Network Mapping:** Visually plots four core node types:
  1. **Cases / FIRs**
  2. **Persons** (Suspects, Victims, Witnesses, Aliases)
  3. **Vehicles** (License plates, Models)
  4. **Locations** (Hotspots, Addresses)
- **Visual Linkages:** If a shared entity (e.g., a specific suspect or partial license plate) appears in two different cases, the canvas physically draws edges connecting those nodes, instantly highlighting organized crime networks or serial offenders.
- **Interactive Isolation Mode:** By clicking on a specific Case or Entity node, the canvas filters out all unrelated noise, showing only the selected node and its direct web of connections.
- **Search and Filter:** Quickly search for specific FIR numbers or names to locate them on the expansive canvas.

## Technical Implementation
- **Frontend Visualization:** Implemented in `src/app/(protected)/network/page.tsx`. It uses standard SVG rendering to draw nodes and edges efficiently, avoiding the overhead of heavy canvas libraries while maintaining crisp resolution.
- **Data Structure:** The graph depends on a defined Node and Edge data structure (`NETWORK.nodes` and `NETWORK.edges`), linking IDs together. 
- **Dynamic Filtering:** Utilizes React's `useMemo` to dynamically compute `visibleNodes` and `visibleEdges` based on search queries, active category filters, and user selection (Isolation Mode).
