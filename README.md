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
- **Voice-to-Text & Text-to-Speech:** Integrated Web Speech API and advanced TTS services allow hands-free interaction. Ask questions like *"Show me all burglary cases from Vijayanagar"* out loud, and get spoken responses.
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

### 📈 5. Command Analytics & Geospatial Hotspots
- **Predictive Heatmaps:** Geospatial cluster mapping (via Leaflet) highlights emerging crime hotspots.
- **Actionable Risk Forecasts:** Provides command staff with concrete recommendations (e.g., *"Increase patrols in Sector 4 on Saturday night based on recent chain-snatching trends"*).

### 🔒 6. Enterprise-Grade Security & RBAC
- **Station-Level Siloing:** Investigating Officers (IO) are strictly limited to data within their jurisdiction.
- **District Command View:** Superintendents of Police (SP) get macro metrics and district-wide audit logs.
- **Tamper-Proof Audit Trails:** Every query, view, and export is securely logged.

---

## 🗺️ Project Architecture & Stack

```text
       ┌────────────────────────┐
       │   Browser Client       │
       │   React 18 + Vite      │
       │   Tailwind + shadcn    │
       └──────────┬─────────────┘
                  │ (JWT Authenticated REST API)
                  ▼
       ┌────────────────────────┐
       │   Backend Server       │
       │   FastAPI (Python)     │
       └──────────┬─────────────┘
                  ├────────────────────────┐
                  ▼                        ▼
       ┌────────────────────┐    ┌────────────────────┐
       │  Database Layer    │    │   LLM Provider     │
       │  Supabase Postgres │    │   OpenRouter API   │
       │   (PostgreSQL)     │    │  (Gemini 1.5 Pro)  │
       └────────────────────┘    └────────────────────┘
```

| Component | Technology | Description |
|---|---|---|
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS, Recharts, Framer Motion, Lucide icons, Leaflet | Responsive Single Page App (SPA) utilizing a Cohere-inspired enterprise AI design system for clean, controlled interfaces. |
| **Backend** | FastAPI (Python 3.11+), Pydantic, Python-Jose (JWT), Passlib (Bcrypt), PyTesseract (OCR) | High-performance async REST API with strict request validation, RBAC enforcement, and OCR for document ingestion. |
| **Database** | PostgreSQL (hosted on Supabase) | Relational DB optimized for entity matching, audit logs, and jurisdictional queries. |
| **AI/LLM** | OpenRouter (Gemini 1.5 Pro) | Context-aware routing, automated summaries, multi-lingual processing, and legal intelligence. |

---

## 📁 Repository Structure

```text
├── backend/                   # FastAPI Server code
│   ├── app/
│   │   ├── routers/           # API routes (AI, Auth, Analytics, TTS, Legal, etc.)
│   │   ├── services/          # Core business logic (AI tools, graph construction)
│   ├── requirements.txt       
│   └── .env.example
│
├── frontend/                  # Vite + React Client code
│   ├── src/
│   │   ├── components/        # Shared UI components (shadcn/ui)
│   │   ├── pages/             # Pages (Dashboard, Analytics, Cases, Network, Deadlines)
│   │   ├── api/               # API clients
│   │   └── lib/               # Utilities (PDF Generation, Speech hooks, State)
│   └── package.json
│
├── database/                  # Schema & Migrations
└── docs/                      # Technical designs and architectures
```

---

## 🛠️ Setup & Installation

### 1. Database Setup
1. Recreate the database structure by executing scripts in `database/migrations/`.
2. Load sample data from `database/seed/seed.sql`.

### 2. Backend Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .\.venv\Scripts\activate
pip install -r requirements.txt
```
Install System Dependencies for OCR (Tesseract):
- **macOS**: `brew install tesseract tesseract-lang`
- **Ubuntu/Debian**: `sudo apt-get install tesseract-ocr tesseract-ocr-kan`

```bash
cp .env.example .env       # Fill in DATABASE_URL, OPENROUTER_API_KEY, etc.
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
API runs on `http://localhost:8000` (Swagger at `/docs`).

### 3. Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env       # Set VITE_API_URL and VITE_GOOGLE_MAPS_API_KEY
npm run dev
```
Client runs on `http://localhost:5173`.

---

## 🛡️ Demo Credentials

| Role / Rank | Badge ID | Password | Jurisdiction / Station |
|---|---|---|---|
| **Investigating Officer (IO)** | `KA-CON-1001` | `demo1234` | Vijayanagar Police Station |
| **Investigating Officer (IO)** | `KA-INS-4471` | `demo1234` | Koramangala Police Station |
| **Superintendent of Police (SP)** | `KA-SP-9999` | `demo1234` | District-wide (All Stations) |
