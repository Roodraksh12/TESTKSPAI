# Cross-case linkage canvas

## Current implementation

The `/network` React page renders a movable, zoomable SVG graph supplied by the
FastAPI network service. Nodes represent cases, people, vehicles and reporting
locations.

Recorded case-person links and officer-confirmed matches can contribute to
clusters, hubs and bridge analysis. Machine-generated similarity matches remain
separate leads until an officer confirms them.

## Case-focused navigation

Opening the canvas from a dossier sends the selected case as a seed. The backend
loads that accessible case first and then expands a bounded neighbourhood through
shared recorded people, active case matches and explicit person relationships.
It does not require the case to appear in the newest 60 records and never falls
back to an unrelated hub when the requested case is outside the officer's scope.

The unseeded jurisdiction view remains capped for a readable hackathon demo. A
production graph should use indexed server-side entity search and paginated
neighbourhood expansion instead of attempting to load the full criminal graph.

## Boundary

The canvas uses only records in the isolated test database. It is not connected
to CCTNS, ICJS or a live criminal database, and a displayed relationship is not
proof of association or guilt.
