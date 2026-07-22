# 🛡️ SCRB Sahayak (KSP Portal)

<div align="center">
  <img src="https://img.shields.io/badge/Status-Active-success.svg" alt="Status Active" />
  <img src="https://img.shields.io/badge/Platform-Web-blue.svg" alt="Platform Web" />
  <img src="https://img.shields.io/badge/Language-Bilingual%20(EN%2FKN)-orange.svg" alt="Bilingual" />
  <img src="https://img.shields.io/badge/AI-Gemini%201.5%20Pro-purple.svg" alt="AI Powered" />
</div>

> **Next-Generation Bilingual AI-Powered Investigation Copilot & Decision Support System** developed for the Karnataka State Police (KSP). Designed to streamline FIR ingestion, automate entity linkage, visualize organized crime networks, and provide command-level predictive intelligence in both **English and Kannada**.

---

## 🌟 Transformative Features (Why It Stands Out)

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

### ⚖️ 4. Intelligent Legal Assistant & Deadlines Tracker
- **Smart Legal References:** Instantly fetches relevant IPC/BNS sections based on case descriptions.
- **Automated Deadline Management:** Tracks statutory timelines (e.g., 60/90 days for charge sheets) and sends proactive alerts to Investigating Officers, ensuring zero procedural lapses.
- **Chargesheet Drafting:** Standalone chargesheet page plus in-app `ChargesheetEditor` (generate, edit, save draft) from Deadlines and case workflows.

### 📈 5. Command Analytics & Geospatial Hotspots
- **Predictive Heatmaps:** Geospatial cluster mapping (via Leaflet) highlights emerging crime hotspots.
- **Actionable Risk Forecasts:** Provides command staff with concrete recommendations (e.g., *"Increase patrols in Sector 4 on Saturday night based on recent chain-snatching trends"*).

### 🔒 6. Enterprise-Grade Security & RBAC
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
       │   RBAC · OCR · TTS     │
       └─────┬────────────┬─────┘
             │            │
       ┌─────▼─────┐  ┌───▼──────────────┐
       │  Supabase │  │   OpenRouter API │
       │  Postgres │  │  (Gemini 1.5 Pro)│
       └───────────┘  └──────────────────┘
```

| Component | Technology | Description |
|---|---|---|
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS, Recharts, Framer Motion, Lucide icons, Leaflet | Responsive SPA for visualization and bilingual copilot UX. |
| **Backend** | FastAPI (Python 3.11+), Pydantic, Python-Jose (JWT), Passlib (Bcrypt), PyTesseract (OCR), Edge-TTS | Async REST API with RBAC, OCR ingestion, and bilingual speech. |
| **Database** | PostgreSQL (hosted on Supabase) | Schema for cases, entity matching, hierarchy (`ltree`), audit logs, jurisdiction. |
| **AI/LLM** | OpenRouter (Gemini 1.5 Pro) | Context-aware routing, FIR summaries, entity extraction, multi-lingual processing. |
| **TTS** | Edge-TTS (`/api/tts`) | Server-side speech synthesis for Read Aloud on copilot replies. |

---

## 🛠️ Setup & Installation

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

## 🛡️ Demo Credentials

There is **no demo button** on the login UI. Enter a Service ID manually. After migrations + seed:

| Role / Rank | Badge ID | Password | Notes |
|---|---|---|---|
| **Police IT** (bootstrap admin) | `KA-IT-0001` | `demo1234` | Administration / IT dashboard; documented in `backend/README.md` / `.env` |
| **Inspector (SHO)** | `KA-INS-4471` | `demo1234` | Station-scoped Copilot / cases |
| **Superintendent of Police (SP)** | `KA-SP-9999` | `demo1234` | District-scoped Overview |
| **Constable** | `KA-CON-1001` | `demo1234` | Station leaf |

---

## 🧪 Testing

```bash
cd backend
pytest
```
