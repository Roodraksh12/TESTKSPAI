# Authentication & Security Module

## Overview
Because the SCRB Sahayak platform handles highly sensitive criminal data and intelligence, it is built on a strict, role-based security architecture. This module ensures that only authorized personnel can access the system and that they only see the data they are legally permitted to view.

## Key Features

### 1. Role-Based Access Control (RBAC)
- **Hierarchical Access:** The system differentiates between standard Investigating Officers (IO) and high-ranking officials like Superintendents of Police (SP).
- **Data Siloing:** An IO can only view cases, analytics, and entities related to their assigned police station. Conversely, an SP has jurisdiction-wide access, allowing them to view macro-level analytics across all stations in the district.

### 2. Secure Authentication
- **NextAuth Integration:** The platform uses industry-standard authentication mechanisms to verify officer credentials before granting access to the `/dashboard` or any protected routes.
- **Session Management:** Secure, encrypted session tokens ensure that data requests to the API are authenticated on every single call.

### 3. Explainable AI & Audit Trails
- **System Logs:** Every query made to the AI Chatbot and every file exported is logged. This ensures accountability. 
- **Read-Only by Default:** The AI copilot operates in a read-only state. It can query the database to provide insights, but it cannot alter or delete official FIR records, ensuring the integrity of the core criminal database remains pristine.

## Technical Implementation
- **Middleware:** Uses Next.js Middleware (`src/middleware.ts`) to forcefully redirect any unauthenticated requests away from protected routes like `/network` or `/cases`.
- **API Security:** API routes (e.g., `src/app/api/chat/route.ts`) manually verify the session context on the server-side before executing database queries or contacting the LLM.
- **Database Filtering:** Prisma queries are dynamically constructed using the user's role. For example, `where: session.user.role === 'SP' ? {} : { stationId: session.user.stationId }`.
