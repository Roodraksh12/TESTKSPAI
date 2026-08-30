# Analytics, hotspots and early warnings

## What the prototype calculates

Analytics and early warnings are deterministic summaries of permitted case
records. They are not AI crime predictions.

- Six-month trend charts group recorded incidents by month and crime type.
- Hotspot grids compare the latest seven days with the preceding 28-day weekly
  baseline.
- Warning severity combines observed volume, baseline growth, recency and
  concentration using visible rules.
- Operational notices are displayed separately from statistical warnings.

The UI explains the observed count and baseline. These indicators support
deployment review and do not identify a likely offender or justify coercive
action.

## Current architecture and scale boundary

FastAPI applies jurisdiction filters and returns prepared chart/map payloads to
React, Recharts and React Leaflet. The current demo calculation reads bounded
date windows and groups some rows in application memory. Before multi-million
case deployment, aggregation must move into indexed SQL/materialized summaries
and be validated with representative query plans.
