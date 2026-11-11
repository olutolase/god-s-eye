# God's Eye

**God's Eye** is a global situational-awareness dashboard created by **George Olutolase**. It brings public earthquake observations, ISS location, global headlines and a transparent rule-based anomaly screen into one responsive interface.

> This is an observation and monitoring tool, not an emergency service, earthquake prediction system, or authoritative source of breaking news.

## Features

- Interactive world map with recent M2.5+ earthquakes and the ISS position/trail.
- Global headlines through the GDELT DOC API.
- Earthquake list with magnitude, depth, time and USGS source links.
- Rule-based seismic anomaly screening. A 5° × 5° cell is flagged when at least four quakes occurred in the latest 24 hours and that count is at least three times the average daily count during the preceding six days.
- Optional AI briefing using the Anthropic Messages API.
- Backend API routes that fetch and normalize public feeds.
- Optional Supabase archive for earthquake/news observations and ISS positions.
- Historical observations panel.
- Responsive layout and creator/about section.

## Stack

- Vite + vanilla JavaScript
- Vercel Functions (backend/API)
- Supabase Postgres (optional historical storage)
- USGS, GDELT and Where the ISS at? public data feeds
- Anthropic Messages API (optional AI briefing)

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run build
npx vercel dev
```

Open the URL printed by Vercel (normally http://localhost:3000). The Vercel development server runs both the Vite frontend and the `/api/*` backend functions. `npm run dev` starts only the Vite frontend; use `npx vercel dev` when you want the live data and backend routes locally.

## Backend and historical database setup

1. Create a project at [Supabase](https://supabase.com/).
2. Open **SQL Editor** in the Supabase dashboard.
3. Paste and run [`supabase/schema.sql`](supabase/schema.sql).
4. In Supabase Project Settings → API, copy the Project URL and `service_role` key. The service-role key is a server secret: never put it in frontend JavaScript, GitHub, or a public document.
5. Add these variables to your local Vercel environment or Vercel Project Settings → Environment Variables:

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | For history | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | For history | Server-only database access |
| `CRON_SECRET` | Recommended | Protects scheduled ingestion |\n| `RATE_LIMIT_SALT` | Recommended | Salts hashed IPs for AI rate limiting |
| `ANTHROPIC_API_KEY` | Optional | Enables AI Brief |

Copy `.env.example` to `.env.local` for local Vercel development and fill in your own values. Never commit `.env.local`.

The `/api/live` route fetches current public feeds and archives events when Supabase is configured. `/api/history` reads the archive. `/api/ingest` is the scheduled ingestion endpoint. The included Vercel cron runs once daily to remain compatible with entry-level deployment plans; opening the dashboard also records a fresh snapshot. If your Vercel plan supports more frequent cron schedules, change the schedule in `vercel.json` to `*/5 * * * *` for every five minutes.

## Deploy publicly with Vercel

1. Create a GitHub account (if you do not already have one) and create a **private or public** repository named `gods-eye`.
2. Unzip this project and upload its files to that repository. Do not upload `.env.local` or any real API keys.
3. Create/sign in to [Vercel](https://vercel.com/) using GitHub.
4. Select **Add New → Project**, import the `gods-eye` repository, and keep the default Vite build settings (`npm run build`, output directory `dist`).
5. Add the environment variables from the previous section in the Vercel project settings. Redeploy after adding them.
6. Vercel assigns a public `*.vercel.app` URL. Test that URL on a phone using mobile data, not only your Wi-Fi.
7. To use a custom domain, buy one from a domain registrar and add it in Vercel → Project → Settings → Domains.

The free Vercel URL is publicly reachable and can be shared immediately after a successful deployment. Search engines may take time to index a new site; a public URL does not guarantee instant Google search visibility.

## API routes

- `GET /api/live` — fetch live feeds and archive a snapshot.
- `GET /api/history` — return the latest archived event records.
- `GET|POST /api/ingest` — scheduled/manual ingestion; checks `CRON_SECRET` when configured.
- `POST /api/brief` — create an AI briefing (requires `ANTHROPIC_API_KEY`).

## Security and operational notes

- Keep Supabase service-role and Anthropic keys in Vercel environment variables only.
- The public feed sources can be delayed, unavailable or rate-limited. The UI shows a feed connection state; it should not be treated as a guaranteed live emergency feed.
- Historical storage is optional. Without Supabase, current monitoring works but the History panel explains that archiving is not configured.
- The AI Brief is optional and may incur API charges through your Anthropic account. It requires Supabase so the backend can enforce a limit of five briefings per IP per hour.
- This first backend version archives observations but does not train a machine-learning forecasting model. A future model should be trained and evaluated against a validated historical dataset, with uncertainty and limitations shown in the product.
- Publicly accessible means anyone with the link can visit. Do not add personal secrets or private credentials to the About section.

## Creator

**George Olutolase** — Creator of God's Eye. Computer Science student at Bowen University and aspiring AI engineer, interested in Python, machine learning, data analysis and building useful technology from real-world data.
