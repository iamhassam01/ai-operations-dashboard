<style>
@page {
  margin: 0.8in 0.9in;
  @bottom-center { content: counter(page); font-size: 8pt; color: #999; }
}
@page :first {
  margin-top: 1.6in;
  @bottom-center { content: none; }
}
@media print {
  body {
    font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
    font-size: 10.5pt;
    line-height: 1.6;
    color: #1a1a1a;
    max-width: 100%;
  }
  h1 { font-size: 22pt; color: #0B1120; margin-bottom: 4pt; letter-spacing: -0.5pt; }
  h2 { font-size: 14pt; color: #0B1120; border-bottom: 2pt solid #2EAADC; padding-bottom: 6pt; margin-top: 30pt; }
  h3 { font-size: 11.5pt; color: #1E2D45; margin-top: 20pt; }
  h4 { font-size: 10.5pt; color: #1E2D45; margin-top: 14pt; }
  table { font-size: 9.5pt; border-collapse: collapse; width: 100%; page-break-inside: avoid; margin: 8pt 0; }
  th { background: #f0f4f8; font-weight: 600; text-align: left; color: #0B1120; }
  th, td { padding: 6pt 10pt; border: 0.5pt solid #ddd; vertical-align: top; }
  tr:nth-child(even) { background: #fafbfc; }
  a { color: #2EAADC; text-decoration: none; }
  code { font-size: 9pt; background: #f5f5f5; padding: 1pt 4pt; border-radius: 3pt; font-family: "JetBrains Mono", "Fira Code", monospace; }
  hr { border: none; border-top: 1pt solid #e0e0e0; margin: 20pt 0; }
  blockquote { border-left: 3pt solid #2EAADC; padding-left: 12pt; margin-left: 0; color: #444; font-style: italic; }
  .page-break { page-break-before: always; }
  table { page-break-inside: avoid; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
  h2, h3, h4 { page-break-after: avoid; }
  ul, ol { margin: 4pt 0; padding-left: 18pt; }
  li { margin-bottom: 3pt; }
}
</style>

<!-- Cover Section -->

# Milestone 1 — Final Completion Report

**Gloura · Autonomous AI Operations Agent**

---

|                      |                                                                                                       |
| :------------------- | :---------------------------------------------------------------------------------------------------- |
| **Client**     | Ivan Korn                                                                                             |
| **Project**    | Autonomous AI Operations Agent — MVP / Pilot                                                         |
| **Milestone**  | 1 of 4                                                                                                |
| **Started**    | February 4, 2026                                                                                      |
| **Completed**  | February 24, 2026                                                                                     |
| **Dashboard**  | [https://gloura.me](https://gloura.me)                                                                   |
| **Repository** | [github.com/iamhassam01/ai-operations-dashboard](https://github.com/iamhassam01/ai-operations-dashboard) |
| **Version**    | 2.0 — Revised February 24, 2026                                                                      |

---

<div class="page-break"></div>

## 1. Executive Summary

Milestone 1 is **fully complete**. The server, database, AI agent, operations dashboard, telephony, domain, SSL, branding, Google Calendar integration, API usage tracking, and intelligent chat interface are all deployed and running in production at **https://gloura.me**.

This milestone delivers a complete operational foundation that exceeds the original scope. The system is ready for pilot testing and provides a solid base for Milestones 2–4.

### 1.1 Deliverable Summary

| Deliverable                               | Status               | Notes                                                     |
| :---------------------------------------- | :------------------- | :-------------------------------------------------------- |
| Server & infrastructure (VPS, Nginx, PM2) | **Complete**  | Ubuntu 24.04, Node.js v22, PM2 process manager            |
| Database (11 tables, seed data, indexes)  | **Complete**  | PostgreSQL 17.7, 15+ indexes, API usage tracking table    |
| AI agent (OpenClaw + GPT-4o)              | **Complete**  | Agent loop, voice, cron jobs, workspace files             |
| Dashboard (7 pages, 26+ components)       | **Complete**  | Full operations dashboard exceeding original scope        |
| Telephony — inbound & outbound (Twilio)  | **Complete**  | +1 (227) 263-7593, multi-turn voice conversations         |
| Domain & SSL (gloura.me)                  | **Complete**  | Let's Encrypt auto-renewing cert, expires May 20, 2026    |
| Google Calendar integration               | **Complete**  | OAuth flow, event CRUD, conflict detection, agent context |
| API usage tracking & cost monitoring      | **Complete**  | Per-call tracking with cost estimation dashboard          |
| Gloura branding & design system           | **Complete**  | Custom dark theme, design tokens, mountain logo           |
| Intelligent chat with GPT-4o              | **Complete**  | Voice recording, web search, markdown, action system      |
| Source code (GitHub)                      | **Complete**  | 20 commits, version-controlled, secrets excluded          |

<div class="page-break"></div>

## 2. Scope vs. Delivery

The table below maps each Milestone 1 requirement from the original scope to what was delivered.

| # | Requirement                         | Delivered | Notes                                                                                            |
| - | :---------------------------------- | :-------- | :----------------------------------------------------------------------------------------------- |
| 1 | Telephony setup, inbound & outbound | Yes       | Twilio number active, OpenClaw Voice Call Plugin with multi-turn conversation support            |
| 2 | Call recording & transcription      | Yes       | Recording infrastructure across database, Twilio, and dashboard UI with audio playback           |
| 3 | Calendar integration (Google)       | Yes       | Full OAuth flow, event CRUD, free/busy queries, conflict detection, agent-aware calendar context |
| 4 | Task model & basic dashboard        | Yes       | Full operations dashboard with 7 pages — far exceeds the original "basic dashboard" scope       |
| 5 | Domain & SSL                        | Yes       | `gloura.me` with Let's Encrypt HTTPS, auto-renewing certificate                                |
| 6 | Approval workflow                   | Yes       | Approve/reject flow with audit trail, approval queue on home page                                |
| 7 | Call history & transcripts          | Yes       | Filter by direction/status, expandable cards, transcript viewer, audio playback                  |
| 8 | AI agent with agentic capabilities  | Yes       | GPT-4o chat, web search, voice recording with Whisper, task creation, calendar actions           |
| 9 | Usage monitoring                    | Yes       | API usage tracking with per-model cost breakdown, daily trends, service-level analytics          |

### 2.1 Scope Expansion (delivered beyond requirements)

| Additional capability                   | Description                                                                         |
| :-------------------------------------- | :---------------------------------------------------------------------------------- |
| Intelligent chat interface (Agent page) | Full conversation UI with GPT-4o, action parsing, web research, and markdown output |
| Voice recording & transcription         | Record voice messages in chat, transcribed via OpenAI Whisper                       |
| API cost tracking dashboard             | Real-time monitoring of OpenAI/Twilio/Google API usage with cost estimation         |
| Agent memory management                 | Persistent agent memory with search, view, and manage capabilities in Settings      |
| Notification system with badges         | Real-time unread counts, grouped-by-date feed, mark-read, filterable by type        |
| Real-time health monitoring             | Live status of Database, OpenClaw, Twilio, and OpenAI services                      |
| Custom design system (Gloura brand)     | 100+ semantic CSS tokens, dark/light themes, stagger animations, mobile responsive  |
| Contact management                      | Contacts CRUD with phone number lookup for call identification                      |

<div class="page-break"></div>

## 3. Technical Architecture

### 3.1 Infrastructure

| Component     | Detail                                                          |
| :------------ | :-------------------------------------------------------------- |
| VPS           | Hostinger KVM, 76.13.40.146, Paris DC                           |
| OS            | Ubuntu 24.04 LTS                                                |
| Runtime       | Node.js v22.22.0                                                |
| Framework     | Next.js 16 (App Router, Turbopack)                              |
| Database      | PostgreSQL v17.7                                                |
| Web Server    | Nginx v1.24.0 — reverse proxy for dashboard, gateway, webhooks |
| Process Mgr   | PM2 v6.0.14 — auto-restart via systemd                         |
| Firewall      | UFW — ports 22, 80, 443, 18789                                 |
| Domain        | gloura.me (Namecheap DNS → 76.13.40.146)                       |
| SSL           | Let's Encrypt via Certbot — auto-renews May 20, 2026           |
| Styling       | Tailwind CSS v4 with semantic design tokens                     |
| Data Fetching | TanStack React Query v5 with polling                            |

### 3.2 AI Agent — OpenClaw

OpenClaw v2026.2.6-3 with GPT-4o (128K context). The agent introduces itself as **"Mr. Ermakov, calling on behalf of Ivan Korn"** on phone calls, and as **"Bob"** in the dashboard chat interface.

| Feature             | Detail                                                                                                                  |
| :------------------ | :---------------------------------------------------------------------------------------------------------------------- |
| Gateway             | Port 18789, token-authenticated                                                                                         |
| AI Model            | GPT-4o (128K context) for reasoning; GPT-4o-mini for TTS                                                                |
| Voice               | OpenAI TTS, voice "alloy"                                                                                               |
| Cron jobs (4)       | Morning report (9 AM), Evening summary (6 PM), Process approved tasks (15 min), Hourly reminders (10 AM–5 PM weekdays) |
| Workspace files (6) | `SOUL.md`, `IDENTITY.md`, `AGENTS.md`, `TOOLS.md`, `HEARTBEAT.md`, `USER.md`                                |
| Capabilities        | Web research, task management, email, voice calls, calendar — with approval gates                                      |

<div class="page-break"></div>

### 3.3 Telephony — Twilio

| Detail           | Value                                                                                   |
| :--------------- | :-------------------------------------------------------------------------------------- |
| Phone number     | +1 (227) 263-7593 (US)                                                                  |
| Plugin           | @openclaw/voice-call v2026.2.6-3                                                        |
| Mode             | Multi-turn conversation (outbound & inbound)                                            |
| Text-to-speech   | OpenAI TTS, voice "alloy"                                                               |
| Phone greeting   | "Hello! This is Mr. Ermakov, calling on behalf of Ivan Korn. How can I help you today?" |
| Inbound handling | Allowlist policy, auto-linked to tasks, notifications generated                         |

### 3.4 Google Calendar Integration

| Detail            | Value                                                                                     |
| :---------------- | :---------------------------------------------------------------------------------------- |
| Auth method       | OAuth 2.0 with offline access (persistent refresh tokens)                                 |
| Token storage     | PostgreSQL `settings` table — auto-refreshes, survives restarts                        |
| Connected account | `jkhancarconnect@gmail.com` (demo calendar)                                             |
| Event operations  | Create, read, update, delete via Google Calendar API v3                                   |
| Availability      | Free/busy queries, conflict detection for proposed time slots                             |
| Agent awareness   | Calendar context auto-injected into AI system prompt (today's events, conflicts, next up) |
| Chat actions      | `create_calendar_event` and `check_calendar` commands available in agent chat         |
| Persistence       | Once connected, valid for all dashboard visitors — no re-authentication required         |

### 3.5 API Usage Tracking

| Detail           | Value                                                                               |
| :--------------- | :---------------------------------------------------------------------------------- |
| Tracked services | OpenAI (GPT-4o, GPT-4o-mini, Whisper), Twilio, Google Calendar API                  |
| Metrics          | Request count, prompt/completion tokens, estimated cost (USD), latency (ms)         |
| Cost models      | Per-model pricing (GPT-4o: $2.50/$10 per 1M tokens, GPT-4o-mini: $0.15/$0.60, etc.) |
| Dashboard        | Summary cards, by-service breakdown, by-model breakdown, daily trends, recent calls |
| Refresh          | Auto-refresh every 60 seconds, plus manual refresh button                           |
| Time ranges      | 7-day, 30-day, and 90-day views                                                     |

<div class="page-break"></div>

### 3.6 Dashboard

Live at **https://gloura.me** — 7 pages, 26+ components, 26 API endpoints.

| Page                    | Description                                                                                                                                                                         |
| :---------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home**          | Greeting, approval queue, stat cards (total tasks, active, completed, calls), system health, recent tasks & calls, agent activity feed                                              |
| **Tasks**         | Create/search/filter tasks by 10 statuses; detail drawer with linked calls and approvals                                                                                            |
| **Agent**         | Full GPT-4o chat interface with voice recording (Whisper), web research, markdown rendering, action system (task creation, calendar events, call scheduling)                        |
| **Calls**         | Call history with expandable cards, transcript viewer, audio playback; filterable by direction/status                                                                               |
| **Notifications** | Feed grouped by date, filterable by type, unread counts with header badge, mark-read                                                                                                |
| **Settings**      | 9 sections: Profile, Agent Identity, Communications, Office Hours, Notifications, Integrations (Google Calendar connect/disconnect), API Usage dashboard, System Info, Agent Memory |

#### Dashboard Features

- **Gloura-branded dark theme** (default) with light mode toggle
- **Design system**: 100+ semantic CSS custom properties, auto-switching between themes
- **Responsive**: Collapsible sidebar with mobile overlay, adaptive layouts
- **Real-time data**: Polling intervals per resource (stats: 5s, tasks: 10s, API usage: 60s)
- **Loading states**: Skeleton placeholders on every data-driven view
- **Error states**: Friendly error messages with retry capabilities
- **Stagger animations**: Cascading `fadeInUp` entrance effects
- **Keyboard accessibility**: Focus ring utilities on all interactive elements

<div class="page-break"></div>

### 3.7 Database

PostgreSQL 17.7 with **11 tables** and **16+ indexes**.

| Table               | Purpose                                                    | Records |
| :------------------ | :--------------------------------------------------------- | :------ |
| `users`           | Admin and viewer accounts                                  | 2       |
| `tasks`           | 10-status workflow with full task specification fields     | Seeded  |
| `calls`           | Call records with Twilio SIDs, recordings, transcripts     | Live    |
| `call_logs`       | Detailed per-call event tracking (JSONB)                   | Live    |
| `approvals`       | Approve/reject records with auditor identity and timestamp | Live    |
| `contacts`        | Phone number → name/email/company lookup                  | Seeded  |
| `calendar_events` | Cached calendar events linked to tasks                     | Live    |
| `notifications`   | Type-filtered notification feed with read/unread state     | Live    |
| `agent_logs`      | Agent activity log with JSONB detail payloads              | Live    |
| `settings`        | Key-value configuration store (JSONB values)               | 20+     |
| `api_usage`       | Per-request API tracking with tokens, cost, latency        | Live    |

All task fields from the specification are present: title, description, address, two preferred time windows, constraints, contact information, type, and priority.

### 3.8 API Endpoints (26 routes)

| Category                | Endpoints                                                                                                                                       |
| :---------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tasks**         | `GET/POST /api/tasks`, `GET/PATCH /api/tasks/[id]`, `POST /api/tasks/[id]/resume`                                                         |
| **Calls**         | `GET/POST /api/calls`, `POST /api/calls/webhook`, `POST /api/calls/status`, `POST /api/calls/test`, `POST /api/calls/[id]/transcribe` |
| **Chat**          | `GET/POST /api/chat`, `GET /api/chat/[id]/messages`, `POST /api/chat/[id]/send`, `POST /api/chat/[id]/voice`                            |
| **Calendar**      | `GET/POST/DELETE /api/calendar/events`, `GET /api/calendar/availability`                                                                    |
| **Auth**          | `GET /api/auth/google`, `GET /api/auth/callback`                                                                                            |
| **Approvals**     | `GET/PATCH /api/approvals`                                                                                                                    |
| **Notifications** | `GET/PATCH /api/notifications`, `GET /api/notifications/unread-count`                                                                       |
| **Settings**      | `GET/PATCH /api/settings`                                                                                                                     |
| **Monitoring**    | `GET /api/stats`, `GET /api/health`, `GET /api/api-usage`                                                                                 |
| **Other**         | `GET /api/agent-logs`, `GET/POST /api/agent-memory`, `GET/POST /api/contacts`                                                             |

<div class="page-break"></div>

## 4. Integration Status

Verified February 24, 2026.

| Integration       | Status                 | Detail                                                                    |
| :---------------- | :--------------------- | :------------------------------------------------------------------------ |
| OpenClaw AI agent | **Connected** ✅ | Gateway on port 18789, GPT-4o active, 4 cron jobs running                 |
| Twilio voice      | **Connected** ✅ | +1 (227) 263-7593 active, voice plugin loaded, inbound/outbound live      |
| OpenAI            | **Connected** ✅ | GPT-4o for chat reasoning, Whisper for voice transcription, TTS for calls |
| Google Calendar   | **Connected** ✅ | OAuth tokens stored, auto-refresh enabled, persistent across sessions     |
| Domain & SSL      | **Active** ✅    | gloura.me with HTTPS — cert valid until May 20, 2026                     |
| PostgreSQL        | **Connected** ✅ | v17.7, 11 tables, 28ms average query response                             |

### Health Check Output (February 24, 2026)

```json
{
  "status": "healthy",
  "services": {
    "database":  { "status": "connected", "detail": "PostgreSQL OK" },
    "openclaw":  { "status": "connected", "detail": "OpenClaw Active" },
    "twilio":    { "status": "connected", "detail": "Twilio Active" },
    "openai":    { "status": "connected", "detail": "OpenAI Active" }
  }
}
```

<div class="page-break"></div>

## 5. Branding & Design System

The dashboard uses the custom **Gloura** design system with the following identity:

| Element       | Value                                                                      |
| :------------ | :------------------------------------------------------------------------- |
| Brand name    | Gloura                                                                     |
| Primary color | Deep navy `#0B1120`                                                      |
| Accent color  | Teal blue `#2EAADC`                                                      |
| Border color  | Muted navy `#1E2D45`                                                     |
| Logo          | Mountain silhouette in sidebar header                                      |
| Typography    | Inter with OpenType features `cv02 cv03 cv04 cv11`                       |
| Default theme | Dark mode (light mode available via toggle)                                |
| Token system  | 100+ CSS custom properties across surfaces, text, borders, status, sidebar |

Dark mode is the default experience. All colors, surfaces, borders, and interactive states are controlled by semantic CSS tokens that auto-switch between light and dark themes via the `data-theme` attribute.

<div class="page-break"></div>

## 6. Running Services

Verified February 24, 2026 — all services online with 10+ hours uptime.

| Service                     | Port              | Status |
| :-------------------------- | :---------------- | :----- |
| Dashboard (Next.js via PM2) | 3000              | Online |
| OpenClaw AI Gateway         | 18789             | Online |
| Voice Call Plugin           | 3334              | Online |
| PostgreSQL 17.7             | 5432              | Online |
| Nginx (reverse proxy)       | 80 → 443 (HTTPS) | Online |

**Dashboard URL**: [https://gloura.me](https://gloura.me)

<div class="page-break"></div>

## 7. Source Code & Version Control

The codebase is maintained in a private GitHub repository with 20 versioned commits spanning the full development timeline.

**Repository**: [github.com/iamhassam01/ai-operations-dashboard](https://github.com/iamhassam01/ai-operations-dashboard)

### Commit History

| Date   | Commit      | Description                                                              |
| :----- | :---------- | :----------------------------------------------------------------------- |
| Feb 4  | `6240aad` | Design system with CSS custom properties and theme tokens                |
| Feb 4  | `5879c6c` | UI primitive components (Button, Badge, Card, Modal, etc.)               |
| Feb 5  | `d7289a3` | API route handlers for stats, tasks, calls, approvals, notifications     |
| Feb 5  | `63dc2ba` | App shell with collapsible sidebar, header, theme toggle                 |
| Feb 6  | `bf17268` | Dashboard widgets (QuickStats, Greeting, ConnectionStatus, ActionCenter) |
| Feb 7  | `cd03727` | Dashboard home, tasks page with full CRUD, and calls page                |
| Feb 8  | `2d806b6` | Notifications center with filtering and settings page                    |
| Feb 10 | `5686ea9` | Deployment config — PM2, Nginx, DB migration, OpenClaw agent, seed data |
| Feb 11 | `6381adc` | Agent chat feature with conversation UI, action system, and memory       |
| Feb 12 | `d17690c` | Agentic task processing, voice & chat upgrades, memory management        |
| Feb 13 | `75b0a0e` | Real web search, smart call decisions, markdown formatting               |
| Feb 13 | `f700dd2` | Professional activity cards, research in chat, clean task previews       |
| Feb 14 | `446c187` | Fix agentic flow failure, duplicate cards, voice processing              |
| Feb 14 | `2aad679` | Fix web search stale data, mobile chat sidebar, button alignment         |
| Feb 15 | `8ee106c` | Full agentic capabilities — voice calls, cron automation, retry logic   |
| Feb 19 | `cdd8048` | Clean repo of internal files, update .gitignore                          |
| Feb 22 | `5d0c254` | Fix approval routing, task approvals API, agent identity, email URLs     |
| Feb 22 | `9012ad6` | Correct phone identity naming, clean internal files                      |
| Feb 24 | `ec1bf90` | Google Calendar integration + API usage tracking                         |

All credentials are stored in environment variables and excluded from version control. A `.gitignore` excludes node_modules, `.env`, build artifacts, and internal documentation.

<div class="page-break"></div>

## 8. Security & Operational Practices

| Practice                  | Implementation                                                                |
| :------------------------ | :---------------------------------------------------------------------------- |
| Parameterized SQL queries | All database queries use `$1`, `$2` parameters — no string interpolation |
| Credential management     | All secrets in environment variables via PM2 `ecosystem.config.js`          |
| HTTPS enforcement         | Nginx redirects HTTP → HTTPS; HSTS headers enabled                           |
| Firewall                  | UFW allowing only ports 22, 80, 443, 18789                                    |
| Token authentication      | OpenClaw gateway requires bearer token for all requests                       |
| OAuth token security      | Google OAuth tokens stored encrypted in DB, auto-refreshed server-side        |
| GitHub push protection    | Repository blocks commits containing detected secrets                         |
| Git secret exclusion      | `.gitignore` excludes `.env`, credentials, and deployment scripts         |

<div class="page-break"></div>

## 9. Milestone 2 Preview

Milestone 2 covers **research and calling workflows**. The foundation built in Milestone 1 directly supports these deliverables:

| Deliverable                     | Description                                                            | M1 Foundation                      |
| :------------------------------ | :--------------------------------------------------------------------- | :--------------------------------- |
| Research workflow               | Agent researches and identifies contacts for each task                 | Web search + GPT-4o already active |
| Outbound calling                | At least 3 calls per task after approval; agent calls as "Mr. Ermakov" | Twilio + voice plugin ready        |
| Inbound call handling           | Incoming calls linked to tasks; offer details captured                 | Webhook + call logging in place    |
| Structured offer capture        | Price, availability, scope, warranty, payment methods per call         | Task model supports extension      |
| Email follow-ups                | Sent and received emails logged in the dashboard                       | Email utility library built        |
| Calendar conflict detection     | Check availability before proposing meeting times                      | Calendar integration complete      |
| Offer comparison & shortlisting | Normalize offers, generate 5–8 option shortlist with recommendation   | Agent reasoning engine ready       |

### Capabilities Already in Place for M2

- ✅ Twilio outbound calling with multi-turn conversations
- ✅ Web research via real-time search integration
- ✅ GPT-4o reasoning with action parsing (create tasks, schedule calls, check calendar)
- ✅ Google Calendar conflict detection and event creation
- ✅ Approval workflow (approve/reject before any action)
- ✅ API usage tracking (monitor costs as call volume increases)
- ✅ Email sending utility

<div class="page-break"></div>

## 10. Known Limitations & Notes

| Item                    | Detail                                                                                                                 |
| :---------------------- | :--------------------------------------------------------------------------------------------------------------------- |
| Google Calendar account | Connected to demo account `jkhancarconnect@gmail.com` for testing; can be switched to production calendar when ready |
| OAuth consent screen    | Currently in "Testing" mode — sufficient for pilot; publish for public use if needed                                  |
| API cost tracking       | Estimated costs based on published model pricing; actual billing is on the OpenAI/Twilio platforms                     |
| Voice call webhook      | Runs through Twilio → Nginx → OpenClaw voice plugin; no ngrok dependency                                             |
| Single-tenant           | Dashboard is designed for one business owner; all visitors see the same data                                           |

<div class="page-break"></div>

## 11. Conclusion

Milestone 1 is **fully delivered** with all originally scoped items completed, plus significant additional capabilities. The system provides:

- A **production-ready infrastructure** with domain, SSL, database, and process management
- An **intelligent AI agent** (OpenClaw + GPT-4o) with voice calling, web research, and calendar awareness
- A **polished dashboard** with 7 pages, real-time monitoring, and mobile support
- **Complete integrations** — Twilio, OpenAI, Google Calendar, all verified online
- **Operational visibility** through API usage tracking and system health monitoring
- A **solid foundation** for Milestones 2–4, with most building blocks already in place

The project is deployed at **https://gloura.me** and ready for pilot testing.

---

<br>
<br>

**WebSculptors**
Version 2.0 — February 24, 2026
