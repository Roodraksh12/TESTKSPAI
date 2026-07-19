# Analytics & Predictive Intelligence Module

## Overview
The Analytics Command Center (located in the `/analytics` route) provides station-level and district-level commanders with a comprehensive, real-time overview of crime dynamics. It combines historical trend analysis with AI-powered predictive intelligence to shift policing from reactive to proactive.

## Key Features

### 1. Crime Trend & Hotspot Detection
- **Interactive Hotspot Map:** Utilizes live GPS data to plot crime clusters across the jurisdiction. High-density zones are marked with varying intensity indicators (Red, Amber, Teal), allowing rapid deployment of resources to active hotspots.
- **6-Month Crime Trend Chart:** An interactive line chart that tracks the historical frequency of major crimes (e.g., Vehicle Theft, Burglary, Cyber Crime) month-over-month. This helps command staff instantly identify whether specific crime categories are surging or declining over time.

### 2. Predictive Analytics & Early Warnings
- **7-Day Risk Forecast (Radar Chart):** A forward-looking visualization that plots the AI's predicted risk levels for various crime categories against the historical baseline. This enables preemptive awareness of which crimes are most likely to spike in the coming week.
- **Early Warning System Feed:** An actionable, live-updating alert feed. Instead of just displaying raw data, the AI generates direct tactical warnings based on pattern recognition (e.g., "78% probability of a Vehicle Theft Spike"). Each alert includes:
  - **Location & Timeframe:** Where and when the threat is expected.
  - **AI Reasoning:** The historical pattern or trigger that prompted the alert.
  - **Recommended Action:** Actionable advice such as "Increase Night Patrol (22:00 - 02:00)".

## Technical Implementation
- **Data Visualization:** Built using the `recharts` library for responsive, high-fidelity SVG charts (`src/components/scrb/trend-charts.tsx`).
- **Geospatial Mapping:** Implemented via `react-leaflet` (`src/components/scrb/hotspot-map.tsx`). The map component is dynamically imported with `ssr: false` in Next.js to ensure client-side rendering compatibility.
- **Modularity:** The analytics dashboard is broken down into modular React components, allowing for easy updates and live-data integration in the future.
