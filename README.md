# GradLaunch

A centralized, AI-powered **placement & job application management platform** for final-year students, fresh graduates, and job seekers.

Discover real job openings from company career sources, track every application from submission to outcome, store the *exact* resume used for each application, generate job-specific (ATS-friendly) resumes with AI, download them as PDFs, and manage interviews and deadlines from one dashboard.

---

## Feature summary

| Area | What you get |
| --- | --- |
| **Auth** | Email/password signup, login, logout, session cookies (30 days), forgot/reset password |
| **Onboarding** | Profile setup: college, branch, grad year, skills, preferred domains/roles/locations, links |
| **Dashboard** | 7 stat cards, application funnel, upcoming events, proactive reminders (interviews, assessments, deadlines in the next 7 days), activity feed, quick actions |
| **Job discovery** | Real openings from configured sources, full search/filter/sort, per-user relevance % with matched/missing skills, graduation-year eligibility hints and "why this matches" reasons, source transparency, save jobs |
| **Applications** | Full CRUD with company, JD, URLs, dates, recruiter contacts, notes, source; 12-stage visual status system with per-change history (previous → new, timestamp, note) |
| **Resume Vault** | Upload PDF/DOCX/TXT → parsed to editable structured data; immutable versions; the resume attached to an application never changes when you update your master |
| **AI resume tailoring** | One-click job-specific rewrite from the application's JD; multi-provider AI (OpenAI, Anthropic, Gemini, Ollama) or deterministic template mode; clearly labelled output; real PDF render + download |
| **Calendar** | Month grid, interviews/coding tests/assessments/deadlines/follow-ups, complete & delete, "next up" list |
| **Analytics** | Totals, status breakdown, top companies, source mix |
| **Admin** | Add/toggle/sync/remove job sources (Greenhouse boards, Workable accounts, RSS/JSON career feeds, Remotive public feed); per-source last-sync status and errors; automatic expiry archiving & de-duplication |

### Honest-by-design principles

- Job listings always show their **source**; nothing claims to be "auto-connected to all career pages".
- Job **matches are scored, not eligibility claims** — matched skills and missing requirements are shown, and the UI reminds students to verify eligibility on the official posting.
- Application **statuses are manual** unless a verified integration provides updates; the UI says so explicitly.
- When `AI_PROVIDER=echo` (no API key), tailoring uses a deterministic template that **labels itself** in the summary and never invents facts.

---

## Tech stack

- **Frontend:** React 18 + Vite + Tailwind CSS + react-router
- **Backend:** Hono (Node HTTP), TypeScript
- **Database:** SQLite via `@libsql/client` (local file or Turso cloud — same schema)
- **PDF:** `pdf-lib` (generate), `pdfjs-dist` (parse uploaded PDFs)
- **AI:** provider-agnostic client with OpenAI / Anthropic / Gemini / Ollama / echo modes
- **Tests:** Vitest (53 tests: unit + full API integration incl. privacy, reminders, DOCX round-trip & PDF round-trip)

---

## Quick start

```bash
npm install

# 1) Configure (optional in dev — a sane default DB and echo AI work with no env)
cp .env.example .env

# 2) Create schema and seed with REAL job data from public boards
#    (needs internet; pulls Stripe/Coinbase/Databricks Greenhouse boards + Remotive)
npm run db:seed

# 3a) Development (Vite on :5173 proxying API on :8787)
npm run dev

# 3b) Production (single server serves API + built client on :8787)
npm run build
npm start
```

**Demo accounts (from seed):**

| Role | Email | Password |
| --- | --- | --- |
| Student | `demo@gradlaunch.app` | `gradlaunch123` |
| Admin | `admin@gradlaunch.app` | `gradlaunch-admin` |

---

## Environment variables

See `.env.example` for the full annotated list. Highlights:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | `file:.generated/db/placetrack.db` by default; use a `libsql://` Turso URL for production |
| `AI_PROVIDER` | `echo` (default, no key needed) \| `openai` \| `anthropic` \| `gemini` \| `ollama` |
| `AI_API_KEY` / `AI_MODEL` | Credentials + model for the chosen provider |
| `OPENAI_BASE_URL` | Point at any OpenAI-compatible endpoint (Azure, Groq, OpenRouter, llama.cpp…) |
| `SESSION_SECRET`, `CORS_ORIGINS`, `PORT` | Server hardening/deployment knobs |
| `REMOTIVE_ENABLED` | Toggle the built-in public Remotive feed sync |

### Enabling full AI tailoring

Set e.g.:

```
AI_PROVIDER=openai
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
```

Restart the server. The `/api/tailor` endpoint then rewrites summaries/bullets via the LLM under a strict "use only facts present in the resume" prompt; everything still passes through the same editable, downloadable PDF pipeline. With `AI_PROVIDER=echo`, tailoring is a deterministic template (clearly labelled, zero hallucination).

---

## Job source integrations

Sources are managed by an admin at `/admin`:

1. **Greenhouse boards** — public board token (e.g. `stripe`). No credentials needed for public boards.
2. **Workable accounts** — public account subdomain.
3. **Career-page RSS/JSON feeds** — any company feed whose robots.txt/ToS permits automated access.
4. **Remotive** — public remote-jobs API, toggled by env.
5. **Manual** — users add applications for anything they find elsewhere.

Each sync **upserts** (no duplicates), **archives** postings unpublished for 60 days, and records per-source status (`success`/`error`, message, timestamp) shown in the admin UI.

> Integration structure for authenticated job APIs (e.g. Greenhouse Job Board API with private tokens, Workable with API key) is in place — add credentials in `.env` and extend `server/lib/jobs.ts`; see the docs links shown in the admin panel.

---

## Project structure

```
├─ client/               # React SPA (pages, components, auth context)
├─ server/
│  ├─ index.ts           # HTTP server: API + static client
│  ├─ api.ts             # All REST routes
│  ├─ middleware.ts      # CORS, auth guards, activity/notification helpers
│  ├─ config.ts          # Env config
│  └─ lib/
│     ├─ db.ts           # libsql client + schema DDL
│     ├─ auth.ts         # scrypt hashing, sessions, reset tokens
│     ├─ jobs.ts         # Source normalizers + relevance scoring
│     ├─ resume.ts       # Resume text parser + echo tailoring
│     ├─ pdf.ts          # PDF generation (pdf-lib) + text extraction (pdfjs)
│     └─ ai.ts           # Multi-provider AI client + tailoring prompt
├─ shared/               # Types used by both sides (status metadata, resume schema)
├─ scripts/
│  ├─ dev.ts             # Dev runner (API + Vite)
│  └─ seed.ts            # Schema + real job data + demo users
└─ tests/                # Vitest unit + API integration tests
```

## API overview

All routes under `/api`, cookie-authenticated, per-user row isolation enforced in SQL.

- `POST /auth/signup|login|logout|forgot-password|reset-password`, `GET /auth/me`
- `PUT /profile`
- `GET /jobs` (filters: q, company, role, domain, skill, location, work_mode, employment_type, experience_level, source, deadline_before; sort: relevance|newest|deadline), `GET /jobs/:id`, `POST/DELETE /jobs/:id/save`, `GET /jobs/saved/mine`, `GET /jobs/filters`
- `GET/POST /applications`, `GET/PATCH/DELETE /applications/:id`, `GET /applications/:id/history`
- `GET/POST /events`, `PATCH/DELETE /events/:id`
- `GET/POST /resumes`, `GET /resumes/:id`, `PUT /resumes/:id/content`, `GET /resumes/:id/pdf`, `GET /resumes/:id/download`, `DELETE /resumes/:id`
- `POST /tailor` (resume_id + application_id or job{title,company,description})
- `GET /dashboard`, `GET /analytics`, `POST /notifications/read-all`
- Admin: `GET/POST /admin/sources`, `POST /admin/sources/:id/sync|toggle`, `DELETE /admin/sources/:id`, `POST /admin/sync/remotive`

## Testing

```bash
npm test
```

Covers: auth flows, profile save, **cross-user privacy** (404s on other users' applications/resumes), application CRUD + status history semantics, events, resume upload/parse (PDF/DOCX/TXT incl. round-trips), invalid-file rejection, echo tailoring versioning, reminders (derived from events + deadlines, privacy, completion), grad-year relevance scoring, deadline coverage reporting, **PDF round-trip** (generate → extract text), and dashboard/funnel correctness.

## Deployment notes

- Set `DATABASE_URL` to a Turso (`libsql://…`) URL + `DATABASE_AUTH_TOKEN` for a managed DB, or mount a volume for the SQLite file.
- Set a strong `SESSION_SECRET`, restrict `CORS_ORIGINS`, serve behind HTTPS.
- `npm run build && npm start` runs a single Node process serving both API and client.
