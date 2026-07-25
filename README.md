# 🛡️ SCRB Sahayak (KSP Portal)

<div align="center">

[![Live Demo](https://img.shields.io/badge/🌐_Deployed_App-https%3A%2F%2Fkspai--zgymgiew.onslate.in%2F-blue?style=for-the-badge)](https://kspai-zgymgiew.onslate.in/)
[![Demo Video](https://img.shields.io/badge/📹_Demo_Video-YouTube-red?style=for-the-badge&logo=youtube)](https://youtu.be/_UJdQK79kRM)

<br />

<img src="https://img.shields.io/badge/Status-Active-success.svg" alt="Status Active" />
<img src="https://img.shields.io/badge/Platform-Web-blue.svg" alt="Platform Web" />
<img src="https://img.shields.io/badge/Language-Bilingual%20(EN%2FKN)-orange.svg" alt="Bilingual" />
<img src="https://img.shields.io/badge/AI-Gemini%201.5%20Pro-purple.svg" alt="AI Powered" />

</div>

> **Next-Generation Bilingual AI-Powered Investigation Copilot & Decision Support System** developed for the Karnataka State Police (KSP). Designed to streamline FIR ingestion, automate entity linkage, visualize organized crime networks, track statutory deadlines, issue predictive early warnings, and provide command-level intelligence in both **English and Kannada**.

---

## 🔗 Quick Links

- 🌐 **Live Web Application:** [https://kspai-zgymgiew.onslate.in/](https://kspai-zgymgiew.onslate.in/)
- 🎥 **Video Walkthrough / Demo:** [https://youtu.be/_UJdQK79kRM](https://youtu.be/_UJdQK79kRM)

---

## 📋 Prototype Brief

### 1. Problem Statement Addressed
Law enforcement agencies, such as the Karnataka State Police (KSP), face critical operational bottlenecks:
- **Manual & Error-Prone Ingestion:** Traditional FIR indexing requires tedious manual data entry, leading to backlogs and missed entity connections across police stations.
- **Language Barriers:** Field officers operate primarily in native regional scripts (Kannada), while central databases and formal dossiers often require English, creating friction.
- **Siloed Criminal Intelligence:** Disparate case records conceal underlying organized crime networks, shared aliases, stolen vehicles, and safe houses.
- **Statutory Lapse Risks:** Strict legal deadlines (60/90 days for filing chargesheets) are frequently missed due to manual tracking, resulting in mandatory default bails.
- **Reactive Policing:** Command staff lack real-time predictive spatial analytics to preemptively deploy patrols before localized crime spikes occur.

### 2. Key Features and Functionalities
- **🎙️ Bilingual Voice-Activated AI Copilot:** Natural hands-free voice interaction in both **English and Kannada** powered by Web Speech API and backend Edge-TTS for querying cases and generating court-ready PDF transcripts.
- **📄 Automated FIR Ingestion & Explainable OCR:** Zero-data-entry workflow using Tesseract OCR and LLM entity extraction (Suspects, Victims, Vehicles, Modus Operandi, Locations) with sentence-level visual Explainable AI (XAI).
- **🕸️ Interactive Crime Network Canvas (Link Analysis):** Interactive visual graph plotting invisible connections across cases, shared license plates, mobile numbers, and safe houses to uncover crime rings.
- **⚡ Predictive Early Warning & Tactical Alert Engine:** Automated pattern recognition algorithms that identify localized crime spikes and broadcast real-time tactical patrol advisories to field officers.
- **⚖️ Statutory Deadlines & Chargesheet Draft Generator:** Proactive alerts on statutory 60/90-day chargesheet timelines with an in-app `ChargesheetEditor` to generate and edit formal legal drafts.
- **📈 Command Analytics & Predictive Heatmaps:** Geospatial cluster heatmaps (Leaflet) and 7-day risk forecasts (Radar charts) for district commanders.
- **🔒 Enterprise Security & Hierarchy-Based RBAC:** Strict jurisdictional siloing (Constable, Inspector, SP, Police IT Admin) backed by tamper-proof audit trails.

### 3. Technology Stack Used
- **Frontend SPA:** React 18, TypeScript, Vite, Tailwind CSS, Leaflet Maps, Recharts, Framer Motion, Lucide Icons, Web Speech API.
- **Backend Services:** FastAPI (Python 3.11+), Pydantic, Python-Jose (JWT Authentication), Passlib (Bcrypt), PyTesseract (OCR Engine), Microsoft Edge-TTS.
- **Database & Storage:** PostgreSQL (hosted on Supabase) utilizing PostgreSQL `ltree` extension for hierarchical police org-trees and station-level data siloing.
- **AI & Speech Models:** OpenRouter API (Google Gemini 1.5 Pro) for context-aware bilingual extraction, entity matching, and reasoning; Edge-TTS for multi-lingual speech synthesis.

### 4. Proposed Impact and Use Case
- **Rapid Operational Turnaround:** Cuts FIR processing, entity extraction, and dossier synthesis time from hours down to seconds.
- **Zero Statutory Lapses:** Automated deadline countdowns eliminate procedural default bails by empowering officers with auto-drafted chargesheets well before statutory expiration dates.
- **Proactive Resource Allocation:** Shifts police operations from reactive incident response to predictive, intelligence-driven patrol deployment.
- **Grassroots Empowerment:** Enables non-English speaking field officers across Karnataka to leverage advanced AI intelligence in native Kannada via natural voice commands.

---

## 🔑 Demo Credentials

To test the application across different Role-Based Access Control (RBAC) levels, log in with any of the demo credentials below:

| Role / Rank | Badge ID (Service ID) | Password | Access Level & Scope |
|---|---|---|---|
| 👑 **Police IT Admin** | `KA-IT-0001` | `demo1234` | Statewide Admin; Officer Management & Invites |
| 🏬 **Superintendent of Police (SP)** | `KA-SP-9999` | `demo1234` | District Command Overview, Analytics & Audit Logs |
| 👮 **Inspector (SHO)** | `KA-INS-4471` | `demo1234` | Station-Level Copilot, FIR Ingestion & Link Analysis |
| 🛡️ **Constable** | `KA-CON-1001` | `demo1234` | Station-Level Case Entry & Officer Profile |

> ℹ️ **How to log in:** Open the [Live App](https://kspai-zgymgiew.onslate.in/), enter any **Badge ID** from the table above and password `demo1234`.

---

## 🌟 Transformative Features

SCRB Sahayak isn't just a database; it's an intelligent agent assisting officers at every step of an investigation.

### 🎙️ 1. Bilingual Voice-Activated AI Copilot
- **Voice-to-Text & Text-to-Speech:** Integrated Web Speech API and backend Edge-TTS allow hands-free interaction. Ask questions like *"Show me all burglary cases from Vijayanagar"* out loud, and get spoken responses.
- **English & Kannada Support:** Full native support for Kannada language, ensuring grassroots officers can interact naturally.
- **Context-Aware Memory:** The copilot remembers the case context across multiple interactions, eliminating the need to repeat details.
- **Transcript Export:** Chat histories and case queries can be instantly exported to formal PDF transcripts for record-keeping.

### 📄 2. Automated FIR Ingestion & Smart Parsing
- **Zero-Data-Entry Workflow:** Upload a raw FIR text or image, and the system automatically extracts Suspects, Victims, Vehicles, Modus Operandi (MO), and Locations.
- **Optical Character Recognition (OCR):** Uses Tesseract OCR to read and ingest scanned FIR documents and handwritten Kannada/English text.
- **Asynchronous Background Processing:** FIR uploads are processed via a resilient background queue with real-time UI polling.
- **Explainable AI (XAI):** Extracted entities are visually linked back to the exact sentence in the original FIR, ensuring evidence integrity for court verification.
- **One-Click PDF Dossiers:** Generate comprehensive, court-ready case files and intelligent summaries instantly.

### 🕸️ 3. Interactive Crime Network Canvas (Link Analysis)
- **Visual Graph Rendering:** Advanced SVG/Canvas graphs plot the invisible connections between disparate Cases, Persons, Vehicles, and Locations.
- **Organized Crime Detection:** Instantly uncover shared license plates, aliases, or safe houses across separate cases.
- **Drill-Down Mode:** Isolate a single suspect and recursively expand their immediate connection web.

### ⚡ 4. Predictive Early Warning & Tactical Alert Engine
- **Automated Spike Detection:** Algorithmic scan of incoming FIR patterns automatically detects localized spikes (e.g., sudden increase in vehicle thefts or burglaries within a station jurisdiction).
- **Proactive Tactical Advisories:** Generates concrete patrol advice (e.g., *"78% probability of burglary spike in Sector 3; deploy night patrols between 22:00 and 02:00"*).
- **Real-Time Notification System:** Live unread alert counter, unread/read state tracking, and station-scoped broadcast via `/api/early-warnings`.
- **Geospatial Alert Pinning:** Alerts are linked to exact coordinates on the command map for immediate tactical deployment.

### ⚖️ 5. Intelligent Legal Assistant & Statutory Deadlines Tracker
- **Smart Legal References:** Instantly fetches relevant IPC/BNS sections based on case descriptions.
- **Automated Deadline Management:** Tracks statutory timelines (e.g., 60/90 days for charge sheets) and sends proactive alerts to Investigating Officers, ensuring zero procedural lapses.
- **Chargesheet Drafting:** Standalone chargesheet page plus in-app `ChargesheetEditor` (generate, edit, save draft) from Deadlines and case workflows.

### 📈 6. Command Analytics & Geospatial Hotspots
- **Predictive Heatmaps:** Geospatial cluster mapping (via Leaflet) highlights emerging crime hotspots.
- **7-Day Risk Forecast (Radar Chart):** Forward-looking visualizations comparing predicted crime risks against historical baselines.
- **Multi-Station & District Comparisons:** Allows SPs and Command Staff to evaluate jurisdiction performance and crime trends over 6-month horizons.

### 🔒 7. Enterprise-Grade Security & RBAC
- **Station-Level Siloing:** Investigating Officers (IO) are strictly limited to data within their jurisdiction.
- **District Command View:** Superintendents of Police (SP) get macro metrics and district-wide audit logs.
- **Cascading Invites & Police IT:** Bootstrap Police IT admin invites gazetted ranks; hierarchy-scoped invitations and password resets.
- **Tamper-Proof Audit Trails:** Every query, view, and export is securely logged.

---

## 🗺️ Project Architecture & Stack

SCRB Sahayak uses a modern, separated client-server architecture:

```text
       ┌────────────────────────┐
       │   React + Vite (SPA)   │
       │   Tailwind · Leaflet   │
       └───────────┬────────────┘
                   │ REST / JWT
       ┌───────────▼────────────┐
       │     FastAPI Backend    │
       │  RBAC · OCR · Alerts   │
       └─────┬────────────┬─────┘
             │            │
       ┌─────▼─────┐  ┌───▼──────────────┐
       │  Supabase │  │   OpenRouter API │
       │  Postgres │  │  (Gemini 1.5 Pro)│
       └───────────┘  └──────────────────┘
```

| Component | Technology | Description |
|---|---|---|
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS, Recharts, Framer Motion, Lucide icons, Leaflet | Responsive SPA for visualization, early warnings UI, and bilingual copilot UX. |
| **Backend** | FastAPI (Python 3.11+), Pydantic, Python-Jose (JWT), Passlib (Bcrypt), PyTesseract (OCR), Edge-TTS | Async REST API with RBAC, Early Warning engine, OCR ingestion, and speech. |
| **Database** | PostgreSQL (hosted on Supabase) | Schema for cases, alerts, entity matching, hierarchy (`ltree`), audit logs. |
| **AI/LLM** | OpenRouter (Gemini 1.5 Pro) | Context-aware routing, FIR summaries, entity extraction, multi-lingual processing. |
| **TTS** | Edge-TTS (`/api/tts`) | Server-side speech synthesis for Read Aloud on copilot replies. |

---

## 🛠️ Setup & Local Installation

### 1. Database (Supabase / Postgres)
1. Apply migrations in order: `0003` → `0004_hierarchy_auth` → `0005_command_jurisdiction` (and any newer migrations such as chargesheet draft). See `database/README.md`.
2. Load sample data from `database/seed/seed.sql`.

### 2. Backend Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .\.venv\Scripts\activate
pip install -r requirements.txt
```
Install system dependencies for OCR (Tesseract):
- **macOS**: `brew install tesseract tesseract-lang`
- **Ubuntu/Debian**: `sudo apt-get install tesseract-ocr tesseract-ocr-kan`
- **Windows**: Install Tesseract and ensure it is on `PATH` (or use `backend/start_windows.bat` if provided).

```bash
cp .env.example .env       # Fill DATABASE_URL, OPENROUTER_API_KEY, SUPABASE_JWT_SECRET, optional SMTP_*
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
- Swagger: http://localhost:8000/docs  
- Health: http://localhost:8000/health  

### 3. Frontend Client Setup
```bash
cd frontend
npm install
cp .env.example .env       # Set VITE_API_URL (and Maps key if used)
npm run dev
```
Application URL: http://localhost:5173

---

## 🧪 Testing

```bash
cd backend
pytest
```
