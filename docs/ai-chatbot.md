# Investigation Copilot

## Purpose

The Copilot lets an officer search permitted synthetic case records using
English or Kannada questions. It can run read-only case-search and statistical
tools, carry an active-case context, expose supporting case references, and
export a conversation transcript.

## Current architecture

- React components render the main Copilot and quick-ask surfaces.
- Zustand retains the active conversation state in the browser.
- FastAPI owns prompts, tool selection, jurisdiction checks and audit events.
- PostgreSQL stores saved chat sessions and messages.
- A provider-neutral gateway supports OpenRouter or an approved private
  OpenAI-compatible endpoint without changing the frontend.

External requests are tokenised on the backend. OpenRouter ZDR enforcement is
default-on in configuration, but a synthetic-only demo may explicitly pause it
when free ZDR capacity is unavailable. The response privacy chip reports which
mode was actually used.

## Truthful failure states

Provider errors are shown as unavailable with a retry action. A privacy-policy
shutdown is shown as intentionally disabled, and a valid empty response is
shown separately. The product must never present provider failure as evidence
that a case has no relevant information.

## Boundaries

The Copilot cannot confirm identities, modify FIRs, file reports or initiate a
coercive action. Uncited output is unverified and requires officer review.
