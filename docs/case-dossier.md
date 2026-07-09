# Case Dossier & Ledger Module

## Overview
The Case Dossier module serves as the central hub for managing and reviewing individual First Information Reports (FIRs) and active investigations. It provides a detailed, organized view of all information extracted from a specific case, alongside a ledger for tracking assignments.

## Key Features

### 1. The Case Ledger
- **Overview:** A persistent sidebar interface that lists all cases currently assigned to the logged-in officer or their station.
- **Status Tracking:** Cases are visually tagged with statuses such as `Active`, `Under Review`, or `Cold`, allowing officers to prioritize their workload.
- **Quick Navigation:** Officers can instantly jump into the full details of any case directly from the ledger.

### 2. Case Dossier (Detailed View)
- **Extracted Entities:** Automatically pulls and categorizes all structured data from the raw FIR text, including Suspects, Victims, Vehicles, and Locations.
- **AI Case Summary:** Provides a machine-generated executive summary of the crime, saving investigators from reading pages of unstructured text.
- **Cross-Case Matches:** Automatically scans the jurisdiction's database to flag if any entities in the current case appear in other ongoing investigations.

### 3. PDF Export & Audit Trails
- **One-Click Export:** Officers can generate an official PDF report of the AI's findings and conversation history, which can be attached to the physical case file.
- **Explainable AI:** Every insight provided within the dossier is linked back to the source text within the FIR, ensuring full transparency and an explainable audit trail for court purposes.

## Technical Implementation
- **Routing:** Implemented in Next.js using dynamic routing at `src/app/(protected)/cases/[id]/page.tsx`.
- **Database:** Connects to the Prisma ORM to fetch relational data about the case and its associated entities.
- **PDF Generation:** Utilizes client-side libraries (like `jspdf`) to render the structured DOM elements into a downloadable PDF format.
