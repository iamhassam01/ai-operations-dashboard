# AI Operations Dashboard

A Next.js dashboard for monitoring and managing **OpenClaw** — an autonomous AI assistant that handles calls, tasks, and approvals on behalf of a business owner.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Styling | Tailwind CSS v4 (CSS-first config) |
| Theming | next-themes (`data-theme` attribute) |
| Data Fetching | @tanstack/react-query v5 |
| Icons | lucide-react |
| Toasts | sonner |
| Database | PostgreSQL 17 via `pg` (node-postgres) |
| Process Manager | PM2 |

## Getting Started

### Prerequisites

- Node.js 22+
- PostgreSQL 17
- PM2 (for production)

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/WebSculptors/ai-operations-dashboard.git
   cd ai-operations-dashboard
   ```

2. Create the database and run the schema:
   ```bash
   psql -U postgres -f schema.sql
   psql -U postgres -d ai_operations_agent -f deploy/seed.sql
   ```

3. Install dependencies:
   ```bash
   cd dashboard
   npm install
   ```

4. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000)

### Production Deployment

1. Build:
   ```bash
   npm run build
   ```

2. Configure PM2:
   ```bash
   cp ecosystem.config.example.js ecosystem.config.js
   # Edit ecosystem.config.js with production credentials
   pm2 start ecosystem.config.js
   ```

## Project Structure

```
dashboard/src/
├── app/
│   ├── globals.css          # Design tokens + base styles
│   ├── layout.tsx           # Root layout: Providers > Sidebar + Header + main
│   ├── page.tsx             # Dashboard home
│   ├── api/                 # API route handlers
│   ├── tasks/page.tsx       # Task management
│   ├── calls/page.tsx       # Call log
│   ├── notifications/       # Notification center
│   └── settings/page.tsx    # Settings panel
├── components/
│   ├── dashboard/           # Dashboard-specific widgets
│   └── ui/                  # Reusable UI primitives
├── config/dashboard.ts      # Navigation, polling intervals
├── contexts/                # React context providers
└── lib/db.ts                # PostgreSQL connection pool
```

## Design System

The dashboard uses "Meridian" — a semantic token system defined in CSS custom properties. Colors auto-switch between light/dark themes via `data-theme` attribute.

## License

Proprietary — All rights reserved.
