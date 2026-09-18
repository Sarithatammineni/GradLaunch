# GradLaunch — Project Report

*AI-Powered Placement & Job Application Management Platform*

---

## 1. Problem Statement

Placement season is one of the most stressful and disorganized periods in a student's academic life. A final-year student applying for jobs and internships typically juggles **20–50 applications across multiple companies, portals, and roles**, and the process breaks down in predictable ways:

1. **Application chaos.** Students forget which companies they applied to, against which job description, on which portal, and when. Statuses live in scattered places — email inboxes, college placement cells, LinkedIn, company career portals, personal spreadsheets — with no single source of truth.

2. **Resume versioning failure.** Every application needs a slightly different resume. Students overwrite their only copy repeatedly, so when an interview call arrives weeks later, they can no longer answer *"which resume did I actually submit for this role?"* The exact document that got them shortlisted is lost.

3. **Ineffective self-tailoring.** Recruiters spend seconds per resume; ATS (Applicant Tracking Systems) keyword-filter most of them before a human ever looks. Students lack the time, feedback loop, and writing skill to tailor a resume to every job description — and generic AI chatbots fabricate experience rather than restructure real facts.

4. **Missed deadlines and interviews.** Online assessments, coding tests, and interview rounds arrive with 1–3 days' notice across time zones. Without a unified reminder system, students discover expired application deadlines and missed interview mails after the fact.

5. **Discovery without context.** Openings exist on dozens of career pages (Greenhouse, Workable, RSS feeds), but no tool tells a *specific* student which roles fit *their* skills, graduation year, and preferences — or honestly explains why a role does not fit.

**Goal:** Build a single, trustworthy platform where a student can **discover a job → save it → generate a tailored, ATS-friendly resume → download it as PDF → apply through the official page → record the application → and track it to offer — without ever losing a resume version or missing a deadline.**

---

## 2. Solution Description

### 2.1 Overview

**GradLaunch** is a full-stack web application built as a single deployable unit:

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS, React Router |
| Backend | Node.js with **Hono** (typed HTTP framework), TypeScript end-to-end |
| Database | SQLite via `@libsql/client` (local file in dev, Turso-compatible for production) |
| PDF generation | `pdf-lib` (server-side, real PDF render of every resume) |
| PDF parsing | `pdfjs-dist` (text extraction from uploaded PDFs) |
| DOCX parsing | Custom dependency-free ZIP + `word/document.xml` extractor (Node `zlib`) |
| Auth | Session cookies (30-day), salted password hashing, single-use reset tokens |
| Testing | Vitest — 53 tests: unit + full API integration incl. cross-user privacy |

One Node process serves both the REST API (`/api/*`) and the built React client, making deployment a single `npm start`.

### 2.2 Feature Walkthrough

**Authentication & onboarding.** Email/password signup with validation, login, logout, forgot/reset password (enumeration-safe: the endpoint always returns success), and session persistence. After signup, a profile wizard collects college, degree/branch, **graduation year**, skills, preferred domains/roles/locations, employment preference, and LinkedIn/GitHub/portfolio links — this profile directly powers job matching and resume prefill.

**Job discovery.** Real openings are synced from public career sources (Greenhouse public board APIs — e.g., Stripe, Coinbase, Databricks; Remotive's public remote-jobs feed; configurable RSS/JSON career-page feeds; and manually added postings). Every listing shows its **source and last-sync status** — the app never pretends pages are "auto-connected." A 10-filter search (keyword, company, role, skill, location, work mode, employment type, experience level, domain, source) combines with three sorts and a **per-user relevance score** (see §3.2). Each job card explains *why* it matches: matched skills, missing skills, grad-year alignment, and other reasons — **as hints, never as eligibility guarantees**.

**Application tracking.** Full CRUD for applications with all spec'd fields (company, JD, URLs, dates, recruiter contacts, notes, source). A 12-stage visual status system (Interested → Applied → Assessment → Shortlisted → Interview → Offer → Accepted, plus Rejected/Withdrawn) with an **immutable status history**: every change stores previous status, new status, timestamp, and an optional note. The dashboard updates automatically — funnel, stat cards, activity feed.

**Resume Vault.** Upload PDF, **DOCX, or TXT**; text is extracted and parsed into editable structured data (summary, skills, experience, projects, education). Versions are **immutable**: a tailored resume is stored as a new version linked to its parent, so updating a master resume never changes what a past application submitted. Any version can be re-downloaded in its original format or rendered fresh as a PDF.

**AI resume tailoring.** One click generates a job-specific resume from the application's JD through a multi-provider AI client (§3), under a strict *"use only facts present in the resume"* prompt. Output is editable, rendered to a real PDF server-side, and stored as a separate version attached to the application.

**Reminders & calendar.** A reminder engine proactively derives reminders from calendar events (interviews, assessments, coding tests, follow-ups) *and* open application deadlines within a 7-day window, urgency-graded (Overdue / Today / Soon / Upcoming), surfaced on the dashboard and via a dedicated API.

**Analytics & admin.** Status/company/source breakdowns and totals per user. An admin console manages job sources: add/toggle/sync/remove integrations, per-source last-sync status and errors, automatic expiry archiving, and de-duplication.

### 2.3 Honesty-by-Design Principles

- Job listings always display their **source**; nothing claims automatic connection to all career pages.
- Job matches are **scored hints, not eligibility claims** — the UI explicitly tells students to verify eligibility on the official posting.
- Application statuses are **manual** unless a verified integration provides updates; the UI says so.
- With no AI key configured, tailoring runs in deterministic template mode that **labels itself in the output** and never invents facts.

### 2.4 Architecture Notes

```
client/  → React SPA (pages: Dashboard, Jobs, Applications, Resume Vault,
           Calendar, Analytics, Profile, Admin; shared AppShell + auth context)
server/  → Hono app
  api.ts        → REST routes (auth, profile, jobs, applications, events,
                  resumes, tailor, dashboard, analytics, admin)
  middleware.ts → CORS, session auth, activity logging, notifications
  lib/          → db.ts (schema + client), auth.ts, jobs.ts (sync + scoring),
                  resume.ts (parsing + template tailoring), docx.ts (DOCX
                  extraction), pdf.ts (render + extract), ai.ts (multi-provider
                  LLM client), reminders.ts (pure reminder engine)
shared/  → types shared by client and server (resume schema, status metadata)
scripts/ → dev runner, DB seeder (real public job data + demo accounts)
tests/   → Vitest suites (unit + API integration over an in-memory DB)
```

Every API route is ownership-scoped (`WHERE user_id = ?`), verified by tests that confirm **user B receives 404 for user A's applications, resumes, events, and reminders**.

---

## 3. AI Tools & Elements Used

### 3.1 AI Elements *Inside* the Application

**(a) Multi-provider LLM resume tailoring (`server/lib/ai.ts`).**
A provider-agnostic chat client supporting **OpenAI** (and any OpenAI-compatible endpoint: Azure OpenAI, Groq, Together, OpenRouter, local llama.cpp servers), **Anthropic**, **Google Gemini**, and **Ollama** (local models). The provider is selected by one environment variable (`AI_PROVIDER`) — so the same app runs with a cloud LLM, a local model, or none. The tailoring prompt is grounded: the model receives the structured resume JSON plus the job description and is instructed to reorder, emphasize, and rewrite *only from facts already present*, returning strict JSON (summary, prioritized skills, projects, experience, ATS notes, added keywords). The response is validated and merged; anything missing falls back to the original resume data — the LLM cannot delete facts or fabricate history.

**(b) Deterministic template mode ("echo") — AI-adjacent fallback.**
With no key configured, tailoring runs locally: it keyword-matches the JD against the user's skills, reorders the skills section to lead with matched skills, composes an honest summary, and labels the output `TEMPLATE TAILORING` so no user mistakes it for LLM output. This keeps the full workflow testable (and the test suite deterministic) with zero hallucination risk.

**(c) Skill extraction & relevance scoring (`server/lib/jobs.ts`).**
Rule-based NLP on every synced job: a curated taxonomy of 80+ technical skills is matched against title + description (tokenized, normalized), work modes and employment types are inferred from natural language ("Hybrid – 3 days in office" → `hybrid`; "Summer Internship 2026" → `internship`), and ISO-date deadlines are extracted from free text. The per-user relevance score combines matched skills, preferred domains/roles/locations, employment preference, entry-level friendliness, deadline proximity, and **graduation-year alignment** — scanning postings for year references near the student's grad year and boosting (+6) when the posting targets their batch, penalizing (−3/−8) with explicit "verify eligibility" reasons when it targets a different one.

**(d) Resume text parsing (heuristic ML-adjacent pipeline).**
Uploaded PDF/DOCX/TXT resumes pass through a section-detection parser: heading recognition (Summary / Education / Skills / Experience / Projects), bullet extraction, date-range detection, contact/email/link harvesting, and name detection — turning unstructured documents into the structured JSON that powers the editor and the AI tailoring prompt.

**(e) Proactive reminder intelligence.**
A pure, unit-tested engine computes day deltas against a deterministic "today," classifies urgency (overdue → upcoming), merges heterogeneous sources (events + application deadlines) into one prioritized feed, and excludes completed/passed items — the scheduling-assistant element of the product.

### 3.2 AI Tools Used to *Build* the Application

The application was developed **AI-assisted with Codebuff** (agentic coding assistant) inside VS Code, following a human-directed, spec-first workflow:

- **Codebuff (this project's development agent)** — generated and refactored the codebase from a master specification, wrote and ran the 53-test suite, diagnosed bugs from live behavior (e.g., the `Content-Type` download bug found via HTTP header inspection, literal `\uXXXX` JSX escapes found via accessibility-tree snapshots), performed the GradLaunch rebrand codemod, and prepared the git commit — with the developer reviewing, directing, and approving each step.
- **AI pair-debugging via live browser verification** — the agent drove the running app through real UI flows (login → dashboard → job discovery → filter collapse/expand) and verified behavior from accessibility snapshots and screenshots rather than assumptions.
- **Model-agnostic verification** — because the app itself must run its AI feature without credentials, the echo mode doubles as a development tool: the whole tailoring pipeline is exercised in CI without network or keys.

### 3.3 What Is Deliberately *Not* AI

Trust is a feature: statuses are never auto-magically "shortlisted" by a model, eligibility is never asserted by a classifier, and resume facts are never generated. Every AI/algorithmic output in GradLaunch is explainable, labelled, and human-editable before it reaches a recruiter.

---

## 4. Verification

- **53 Vitest tests** — unit (parsers, scoring, reminders, status metadata) + API integration over an in-memory DB: auth flows, cross-user **privacy isolation**, application CRUD + status-history semantics, resume upload/parse for PDF/DOCX/TXT (incl. byte-identical round-trips), echo tailoring versioning, reminder derivation/completion/privacy, grad-year scoring, deadline coverage, dashboard/funnel correctness, and PDF text round-trips.
- **Live end-to-end verification** — real job sync (1,700+ genuine postings from public boards), login → tailor → PDF download → privacy checks exercised through the actual UI.
- **Type safety** — `tsc --noEmit` strict-mode clean across server, client, scripts, and tests.

---

## 5. Running It

```bash
npm install
npm run db:seed     # real job data + demo accounts (needs internet)
npm run dev         # API on :8787 + Vite HMR on :5173
npm test            # 53 tests
npm run build       # typecheck + production client build
npm start           # single-process production server on :8787
```

Demo accounts (after seeding): `demo@gradlaunch.app / gradlaunch123` (student) · `admin@gradlaunch.app / gradlaunch-admin` (admin). Optional AI providers are configured purely via `.env` — see `.env.example`.
