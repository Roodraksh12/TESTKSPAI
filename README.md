<div align="center">
  <h1>🛡️ SCRB Sahayak</h1>
  <p><strong>Advanced AI-Powered Intelligence Platform for the State Crime Records Bureau</strong></p>
  
  <p>
    <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-14-black" alt="Next.js"></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-Ready-blue" alt="TypeScript"></a>
    <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/TailwindCSS-Styled-38B2AC" alt="TailwindCSS"></a>
    <a href="https://www.prisma.io/"><img src="https://img.shields.io/badge/Prisma-ORM-2D3748" alt="Prisma"></a>
  </p>
</div>

<br />

## 📖 Overview

**SCRB Sahayak** (State Crime Records Bureau Copilot) is a next-generation command center designed to revolutionize how law enforcement agencies interact with criminal databases. By moving away from complex, static search filters, this platform leverages Large Language Models (LLMs) and advanced data visualization to turn raw FIR text into actionable, predictive intelligence.

Whether it's an Investigating Officer (IO) tracking down a stolen vehicle, or a Superintendent of Police (SP) analyzing jurisdiction-wide trends, SCRB Sahayak provides the tools needed to shift policing from reactive to proactive.

---

## ✨ Core Features

### 1. 🤖 Investigation Copilot (AI Chatbot)
- **Natural Language Querying:** Ask the database questions in plain English or Kannada (e.g., *"Show me all vehicle thefts in Sector 4 from last week"*).
- **Voice-Enabled:** Built-in Speech Recognition for hands-free dictated queries.
- **Context-Aware:** The AI remembers the context of your investigation session, allowing for natural follow-up questions.

### 2. 🕸️ Cross-Case Linkage Canvas
- **Visual Network Graphs:** Stop reading text-heavy FIRs and start visualizing crime. The system automatically plots Cases, Suspects, Vehicles, and Locations.
- **Hidden Connections:** Instantly see if a suspect in your current case is linked to an older, unsolved case across town via physical edges drawn on the canvas.

### 3. 🗺️ Hotspot Detection & Predictive Analytics
- **Live GPS Hotspots:** An interactive map (`react-leaflet`) visualizing crime density across the jurisdiction in real-time.
- **7-Day Risk Forecast:** AI-generated radar charts predicting which specific crime categories are most likely to spike in the coming week based on historical baselines.
- **Early Warning System:** Tactical, actionable alerts (e.g., *"78% probability of a Vehicle Theft Spike - Recommend increasing night patrol"*).

### 4. 📂 Automated Case Dossiers
- **Entity Extraction:** The AI automatically extracts and structures suspects, victims, and involved vehicles directly from raw FIR text.
- **Machine-Generated Summaries:** Executive summaries of complex cases to save investigators time.
- **Official PDF Export:** One-click generation of official reports and AI insights that can be attached to the physical case file.

### 5. 🔒 Enterprise-Grade Security
- **Role-Based Access Control (RBAC):** Station-level officers only see local data, while district commanders see macro-level analytics.
- **Explainable AI & Audit Trails:** Every LLM insight is mapped back to the original source text. The AI operates in a strictly read-only capacity, ensuring database integrity.

---

## 🛠️ Technology Stack

- **Frontend:** Next.js 14 (App Router), React 18, TailwindCSS, Framer Motion
- **UI Components:** Shadcn/ui, Radix UI, Recharts, React-Leaflet
- **Backend:** Next.js Server Actions & API Routes
- **Database:** Prisma ORM (SQLite/PostgreSQL)
- **AI Integration:** OpenRouter API (Gemini/Claude/OpenAI), Web Speech API
- **Auth:** NextAuth.js (Role-based session management)

---

## 🚀 Getting Started

Follow these instructions to set up the project locally.

### Prerequisites
- Node.js (v18+)
- Git

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Roodraksh12/KSPAi.git
   cd KSPAi
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory and add the following:
   ```env
   # Database Configuration
   DATABASE_URL="file:./dev.db"

   # OpenRouter API Key (For AI capabilities)
   OPENROUTER_API_KEY="your_openrouter_api_key_here"

   # NextAuth Secret
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="your_random_secret_string"
   ```

4. **Initialize the Database:**
   ```bash
   npx prisma db push
   npm run seed
   ```
   *(Note: The seed script populates the database with mock FIRs, Suspects, and Officer credentials for testing).*

5. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📚 Documentation
Detailed technical documentation for individual modules can be found in the `/docs` folder:
- [AI Chatbot Documentation](./docs/ai-chatbot.md)
- [Cross-Case Linkage Documentation](./docs/cross-case-linkage.md)
- [Hotspot Analytics Documentation](./docs/hotspot-analytics.md)
- [Case Dossier Documentation](./docs/case-dossier.md)
- [Auth & Security Documentation](./docs/auth-security.md)
