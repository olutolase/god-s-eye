# God's Eye

**God's Eye** is a public global situational-awareness dashboard created by **George Tolase**. It combines public news, seismic activity, live aircraft positions, satellite fire detections, official weather alerts and market snapshots in one interactive 3D globe.

> An open-source observation dashboard, not an emergency service, financial advice, a maritime authority, or a prediction system. Data may be delayed, incomplete, rate-limited or geographically uneven.

## Current capabilities

- Interactive, touch-friendly 3D globe with tappable news and earthquake markers.
- News aggregation from CBN News, BBC News, Al Jazeera, The Guardian, Reuters, Associated Press, Channels TV, Premium Times, TheCable, Punch, Vanguard, BusinessDay, Daily Trust, Arise News, AllAfrica and Nigeria/Africa-focused GDELT searches.
- Nigeria-first and pan-African headline filters, with Nigerian publisher feeds receiving a country-level map marker when a precise city is not found. Headline geolocation is approximate text-based matching, not publisher-supplied coordinates.
- OpenSky live aircraft positions with aircraft icons and short projected heading vectors. The vectors show estimated direction over the next two minutes, **not recorded flight paths or verified origin/destination routes**.
- NASA FIRMS active-fire detections when a FIRMS MAP_KEY is configured.
- US National Weather Service active alerts where location geometry is supplied. This is not a global storm catalogue.
- Travel Check: destination geocoding, current weather, recent GDELT security/conflict reporting, WHO Disease Outbreak News matches and optional Cloudflare Radar outage annotations.
- Social Pulse: Google Trends RSS for Nigeria and global search trends, plus direct discovery links to X, Instagram and Facebook. These links are not represented as verified platform-wide trend rankings.
- Market ticker snapshots for SPY, QQQ, S&P 500, Nasdaq, gold and crude oil, via Yahoo Finance chart data.
- Ask God's Eye: Gemini-powered Q&A grounded in current dashboard feeds and optional saved history.
- USGS earthquake observations, seismic screening and optional Supabase event history.
- Mobile-responsive layout and a minimal creator credit: **Created by George Tolase**.

## Data sources and constraints

| Layer | Source | Notes |
|---|---|---|
| News | CBN, BBC, Al Jazeera, The Guardian, Reuters, AP, GDELT | Some publisher feeds are queried through Google News RSS. Headline geolocation is approximate. |
| Aircraft | OpenSky Network | Anonymous API has rate limits and uneven receiver coverage. Position vectors are live; route histories are not supplied by this view. |
| Fires | NASA FIRMS | Requires a free MAP_KEY. Satellite detections are not ground-confirmed reports. |
| Storms | US National Weather Service | Official US alerts only; not a worldwide tropical cyclone tracker. |
| Markets | Yahoo Finance chart endpoint | Informational snapshots, may be delayed and are not trading data. |
| Earthquakes | USGS GeoJSON | Public earthquake feed. |
| Ask God's Eye | Google Gemini API | Requires `GEMINI_API_KEY`; answers are constrained to context supplied by the dashboard. |
| Travel weather | Open-Meteo | Geocoding and current weather/one-day outlook. |
| Travel security | GDELT | Recent reporting search; news discovery, not an official security clearance. |
| Travel outbreaks | WHO Disease Outbreak News RSS | Public global notices; not a complete local outbreak register. |
| Travel internet outages | Cloudflare Radar | Requires optional `CLOUDFLARE_API_TOKEN`; no result is not proof of normal connectivity. |
| Search trends | Google Trends RSS | Nigeria (`NG`) and US/global proxy (`US`) trends; not social-platform trend data. |

### Shipping chokepoints

The Suez Canal, Strait of Hormuz and Strait of Malacca are shown as monitored chokepoints, but vessel counts and traffic-drop alerts are **not enabled yet**. A licensed/provisioned AIS data provider is required for reliable live vessel positions and counts. God's Eye intentionally does not invent vessel counts or imply that OpenSky aircraft data can substitute for AIS.

## Stack

- Vite + vanilla JavaScript
- Globe.gl / Three.js
- Vercel Functions
- USGS, GDELT, publisher RSS, OpenSky, NASA FIRMS, NWS and market data endpoints
- Anthropic Messages API for Ask God's Eye
- Optional Supabase Postgres for history

## Local development

Requires Node.js 20 or newer.

```bash
npm install
npm run build
npx vercel dev
```

Use `npx vercel dev` to run both the frontend and `/api/*` routes. `npm run dev` starts only Vite and does not run Vercel Functions.

## Environment variables

Set secrets in Vercel → Project → Settings → Environment Variables. Never commit real keys.

| Variable | Required for | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Ask God's Eye | Server-side Google Gemini access |
| `GEMINI_MODEL` | Optional | Override the Gemini model name |
| `NASA_FIRMS_MAP_KEY` | Fire layer | Free NASA FIRMS API key |
| `SUPABASE_URL` | History | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | History | Server-only database access |
| `RATE_LIMIT_SALT` | Optional | Salt for privacy-preserving rate-limit hashes |
| `CRON_SECRET` | Scheduled ingestion | Protects the ingestion endpoint |
| `CLOUDFLARE_API_TOKEN` | Optional Travel Check internet layer | Read Cloudflare Radar outage annotations |

Copy `.env.example` to `.env.local` for local use. Never expose server-side keys in browser code.

### Supabase history

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL Editor.
3. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Vercel.
4. Redeploy the project.

Ask God's Eye sends the current browser session's available live observations and recent saved history to the server-side Gemini endpoint. It does not have unrestricted access to the internet or to private user data.

## API routes

- `GET /api/live` — headlines, earthquakes, ISS and feed status.
- `GET /api/intel` — OpenSky aircraft, NASA FIRMS fires (when configured), NWS alerts and market snapshots.
- `POST /api/ask` — Gemini Q&A grounded in the dashboard context.
- `GET /api/travel?place=<city-or-country>` — destination security, health, internet and weather snapshot.
- `GET /api/trends` — Google Trends RSS for Nigeria and global search interest, plus platform discovery links.
- `POST /api/brief` — AI one-way briefing.
- `GET /api/history` — optional archived observations.
- `GET|POST /api/ingest` — scheduled/manual ingestion.

## Deploy

The production site is deployed through the GitHub integration connected to Vercel. Pushes to `main` trigger production deployments. Confirm the latest deployment is marked **Ready** in the Vercel dashboard.

## Operational and safety notes

- Third-party feeds can be delayed, unavailable or rate-limited.
- OpenSky coverage is stronger in some regions than others; aircraft absent from the map are not necessarily absent from the sky.
- Flight heading vectors are short projections, not observed flight paths.
- FIRMS is satellite hotspot data; cloud cover and satellite overpass timing affect detection.
- NWS alerts cover the United States and territories, not every country.
- Markets may be delayed and should not be used as a sole basis for financial decisions.
- Shipping traffic counts are not available until an AIS provider is configured.
- Seismic cluster screening is descriptive only and is not earthquake prediction.
- AI answers may make mistakes; always open original sources for consequential decisions.

## Creator

**Created by George Tolase.**
