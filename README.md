# 🛡️ SCRB Sahayak (KSP Portal)

> **Bilingual AI-Powered Investigation Copilot & Decision Support System** developed for the Karnataka State Police (KSP). Designed to streamline FIR ingestion, automate entity linkage, visualize organized crime networks, and provide command-level predictive intelligence in both **English and Kannada**.

---

## 🗺️ Project Architecture & Stack

SCRB Sahayak uses a modern, separated client-server architecture:

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
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS, Recharts, Framer Motion, Lucide icons, Leaflet | Responsive Single Page App (SPA) optimized for quick navigations and real-time visualization. |
| **Backend** | FastAPI (Python 3.11+), Pydantic, Python-Jose (JWT), Passlib (Bcrypt) | High-performance async python REST API with strict request validation and RBAC enforcement. |
| **Database** | PostgreSQL (hosted on Supabase) | Relational database schema optimized for entity matching, audit logs, and station jurisdiction queries. |
| **AI/LLM** | OpenRouter (Gemini 1.5 Pro) | Context-aware query routing, automated FIR summary generation, entity extraction, and multi-lingual processing. |
| **TTS** | Edge-TTS (backend `/api/tts`) | Server-side speech synthesis for bilingual Read Aloud on copilot replies. |

---

## ⚡ Key Modules & Features

### 1. 🤖 Bilingual Investigation Copilot (AI Chatbot)
- **Conversational Queries**: Officers query the database in natural language (e.g. *"Show me all burglary cases from Vijayanagar"*).
- **Kannada Support**: Complete dual-language capability (translation, input processing, and localized responses).
- **Voice-Enabled Interface**: Web Speech API for hands-free dictation, plus backend Edge-TTS for spoken replies (FIR/CrPC/BNS acronym pronunciation fixes).
- **Context Preservation**: Persists chat history/session context so follow-up queries carry over references to the active case.

### 2. 📁 Dynamic Case Dossier & Ledger
- **Entity Extraction**: Automatically parses and extracts critical entities (Suspects, Victims, Vehicles, Locations) from unstructured FIR text.
- **Explainable AI (XAI)**: Visual cues and back-links map AI summaries directly to the original FIR text source, ensuring evidence integrity for court verification.
- **PDF Dossier Export**: Generate official, formatted case files and summaries with a single click.
- **Chargesheet Drafting**: Standalone chargesheet page plus in-app `ChargesheetEditor` (generate, edit, save draft) from Deadlines and case workflows.

### 3. 🕸️ Cross-Case Linkage Canvas
- **Visual Graph Rendering**: Plots interactive SVG graphs displaying links between Cases/FIRs, Persons, Vehicles, and Locations.
- **Organized Crime Detection**: Instantly shows shared license plates, aliases, or locations across separate cases.
- **Isolation Mode**: Lets investigators focus on a single suspect/case and drill down into their immediate connection web.

### 4. 📈 Command Analytics & Predictive Intelligence
- **Hotspot Heatmaps**: Geospatial mapping showing crime density clusters across different jurisdictions.
- **Early Warnings**: Actionable risk forecast feed alerts command staff to potential crime spikes with concrete recommendations (e.g. *"Increase patrols in sector 4 on Saturday night"*).
- **Statutory Deadlines**: Tracks chargesheet filing and victim-update clocks with risk tiers.

### 5. 🔑 Role-Based Access Control (RBAC) & Security
- **Station-Level Siloing**: Investigating Officers (IO) are restricted to data/cases within their assigned police station.
- **District-Level Scope**: Superintendents of Police (SP) view macro metrics, command panels, and audit logs district-wide.
- **Officer Profile**: Dedicated Profile page for badge, role, and station context.

---

## 📁 Repository Structure

```text
├── backend/                   # FastAPI Server code
│   ├── app/
│   │   ├── main.py            # FastAPI entry point
│   │   ├── deps.py            # Dependency injection (Auth, DB)
│   │   ├── routers/           # API routes (AI, Cases, Auth, Analytics, TTS, Legal, etc.)
│   │   ├── services/          # Core business logic (AI tools, graph construction)
│   │   └── tests/             # Pytest suite
│   ├── requirements.txt       # Python dependencies
│   └── .env.example
│
├── frontend/                  # Vite + React Client code
│   ├── src/
│   │   ├── components/        # Shared component catalog & UI components (shadcn/ui)
│   │   ├── pages/             # Page components (Dashboard, Analytics, Cases, Network, Profile, Deadlines)
│   │   ├── api/               # API clients and HTTP wrappers
│   │   ├── context/           # React Context Providers (Auth)
│   │   └── lib/               # Utility functions, Zustand stores, speech hooks, PDF export
│   ├── package.json
│   └── .env.example
│
├── database/                  # Database management
│   ├── schema.prisma          # Database schema documentation
│   ├── migrations/            # SQL migrations
│   └── seed/                  # SQL seed data
│
└── docs/                      # Technical module designs and architectures
```

---

## 🛠️ Setup & Installation

### 1. Database (Supabase / Postgres)
1. Recreate the database structure by executing the scripts in `database/migrations/` in order, or use your preferred schema tool.
2. Load the sample data from `database/seed/seed.sql` to populate initial officers, stations, and crime incidents.

### 2. Backend Server Setup
1. Navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Fill in your `DATABASE_URL` (Supabase Postgres connection), `OPENROUTER_API_KEY`, and `SUPABASE_JWT_SECRET`.
5. Run the FastAPI development server:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
   - Swagger Documentation: http://localhost:8000/docs
   - API Healthcheck: http://localhost:8000/health

### 3. Frontend Client Setup
1. Navigate to the frontend folder:
   ```bash
   cd frontend
   ```
2. Install Node dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Set `VITE_GOOGLE_MAPS_API_KEY` (if you plan to use map services) and verify the API endpoint prefix (`VITE_API_URL`).
4. Start the Vite development server:
   ```bash
   npm run dev
   ```
   - Application URL: http://localhost:5173

---

## 🛡️ Demo Credentials

Use the following seeded accounts to log in and test different RBAC scopes:

| Role / Rank | Badge ID | Password | Jurisdiction / Station |
|---|---|---|---|
| **Investigating Officer (IO)** | `KA-CON-1001` | `demo1234` | Vijayanagar Police Station |
| **Investigating Officer (IO)** | `KA-INS-4471` | `demo1234` | Koramangala Police Station |
| **Superintendent of Police (SP)** | `KA-SP-9999` | `demo1234` | District-wide (All Stations) |

---

## 🧪 Testing

To run backend integration and unit tests:
```bash
cd backend
pytest
```
