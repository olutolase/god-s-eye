import { geoNaturalEarth1, geoPath, geoGraticule10 } from "d3-geo";
import { feature, mesh } from "topojson-client";
import world from "world-atlas/countries-110m.json";

const W = 960, H = 500;
const SVG_NS = "http://www.w3.org/2000/svg";

const USGS_WEEK = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson";
const ISS_URL = "https://api.wheretheiss.at/v1/satellites/25544";
const GDELT_URL =
  "https://api.gdeltproject.org/api/v2/doc/doc?query=" +
  encodeURIComponent("(conflict OR earthquake OR outbreak OR protest OR attack) sourcelang:english") +
  "&mode=artlist&maxrecords=25&format=json&timespan=24h&sort=hybridrel";

const state = { quakes: [], flagged: [], news: [], iss: null, issTrail: [], feedStatus: null };

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, text) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const ago = (ms) => {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

/* ---------- map ---------- */
const projection = geoNaturalEarth1().fitSize([W, H], { type: "Sphere" });
const path = geoPath(projection);
const svg = $("map");
const gBase = svgEl("g");
const gQuakes = svgEl("g");
const gIss = svgEl("g");
svg.append(gBase, gQuakes, gIss);

function drawBase() {
  gBase.append(svgEl("path", { d: path({ type: "Sphere" }), fill: "none", stroke: "#2a3748" }));
  gBase.append(svgEl("path", { d: path(geoGraticule10()), fill: "none", stroke: "#16202b", "stroke-width": 0.5 }));
  gBase.append(
    svgEl("path", { d: path(feature(world, world.objects.countries)), fill: "#17212c", stroke: "none" })
  );
  gBase.append(
    svgEl("path", {
      d: path(mesh(world, world.objects.countries, (a, b) => a !== b)),
      fill: "none",
      stroke: "#2a3748",
      "stroke-width": 0.5,
    })
  );
}

const tip = $("tip");
function showTip(evt, html) {
  const box = svg.parentElement.getBoundingClientRect();
  tip.textContent = html;
  tip.hidden = false;
  tip.style.left = Math.min(evt.clientX - box.left + 12, box.width - 250) + "px";
  tip.style.top = evt.clientY - box.top + 12 + "px";
}

function drawQuakes() {
  gQuakes.replaceChildren();
  const flaggedIds = new Set(state.flagged.flatMap((c) => c.ids));
  const recent = state.quakes.filter((q) => Date.now() - q.time < 864e5);
  for (const q of recent) {
    const p = projection([q.lon, q.lat]);
    if (!p) continue;
    const flagged = flaggedIds.has(q.id);
    const c = svgEl("circle", {
      cx: p[0], cy: p[1], r: Math.max(2, (q.mag - 1.5) * 2.2),
      fill: flagged ? "#ff4d6d" : "#ff9f43", "fill-opacity": 0.55,
      stroke: flagged ? "#ff4d6d" : "#ff9f43", "stroke-width": 1,
    });
    c.addEventListener("mousemove", (e) => showTip(e, `M${q.mag.toFixed(1)} ${q.place} · ${ago(q.time)}`));
    c.addEventListener("mouseleave", () => (tip.hidden = true));
    gQuakes.append(c);
  }
}

function drawIss() {
  gIss.replaceChildren();
  if (state.issTrail.length > 1) {
    const pts = state.issTrail.map(([lon, lat]) => projection([lon, lat]));
    // break the line where the trail wraps around the date line
    let d = "";
    pts.forEach((p, i) => {
      const wrap = i > 0 && Math.abs(p[0] - pts[i - 1][0]) > W / 2;
      d += (i === 0 || wrap ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1);
    });
    gIss.append(svgEl("path", { d, fill: "none", stroke: "#4dd0e1", "stroke-opacity": 0.5, "stroke-dasharray": "3 3" }));
  }
  if (state.iss) {
    const p = projection([state.iss.lon, state.iss.lat]);
    gIss.append(svgEl("circle", { cx: p[0], cy: p[1], r: 5, fill: "#4dd0e1" }));
    gIss.append(svgEl("circle", { cx: p[0], cy: p[1], r: 10, fill: "none", stroke: "#4dd0e1", "stroke-opacity": 0.6 }));
  }
}

/* ---------- data ---------- */
async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function loadQuakes() {
  // Data is served by our backend, which also archives observations when Supabase is configured.
  const d = await getJson("/api/live");
  state.quakes = (d.quakes || []).sort((a, b) => b.time - a.time);
  state.news = d.news || [];
  state.iss = d.iss || null;
  state.feedStatus = d.feedStatus || null;
  if (state.iss) {
    state.issTrail.push([state.iss.lon, state.iss.lat]);
    if (state.issTrail.length > 60) state.issTrail.shift();
  }
  state.flagged = findClusters(state.quakes);
  drawQuakes();
  drawIss();
  renderQuakes();
  renderSignals();
  renderWire();
  renderStats(d.generatedAt);
}

/* Anomaly signal: bucket quakes into 5-degree cells. A cell is flagged when its
   last-24h count is well above that cell's typical daily count over the prior 6 days. */
function findClusters(quakes) {
  const now = Date.now();
  const cells = new Map();
  for (const q of quakes) {
    const key = `${Math.floor(q.lat / 5)}:${Math.floor(q.lon / 5)}`;
    if (!cells.has(key)) cells.set(key, { recent: [], prior: 0, label: q.place });
    const c = cells.get(key);
    if (now - q.time < 864e5) c.recent.push(q);
    else c.prior++;
  }
  const out = [];
  for (const [key, c] of cells) {
    const baseline = c.prior / 6;
    const n = c.recent.length;
    if (n >= 4 && n >= baseline * 3) {
      const top = c.recent.reduce((a, b) => (b.mag > a.mag ? b : a));
      out.push({
        key, count: n, baseline: +baseline.toFixed(1), maxMag: top.mag,
        place: top.place, ids: c.recent.map((q) => q.id),
        score: n / Math.max(1, baseline),
      });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/* ---------- panels ---------- */
function renderStats(updatedAt) {
  const stats = $("stats");
  if (!stats) return;
  stats.replaceChildren(
    el("div", { class: "stat" }, `${state.quakes.length} <span>EARTHQUAKES</span>`),
    el("div", { class: "stat" }, `${state.news.length} <span>HEADLINES</span>`),
    el("div", { class: "stat" }, `${state.flagged.length} <span>ANOMALIES</span>`),
    el("div", { class: "stat" }, `${updatedAt ? new Date(updatedAt).toLocaleTimeString() : "—"} <span>LAST UPDATE</span>`)
  );
}

async function renderHistory() {
  const pane = $("pane-history");
  pane.replaceChildren(el("p", { class: "muted" }, "Loading archived observations…"));
  try {
    const d = await getJson("/api/history");
    pane.replaceChildren(el("p", { class: "muted" }, d.enabled
      ? `Database archive · ${d.count} recent records`
      : "Historical storage is not configured yet. Add the Supabase environment variables and run supabase/schema.sql."));
    for (const item of (d.events || [])) {
      const row = el("div", { class: "item" });
      row.append(el("div", {}, item.title), el("div", { class: "meta" }, `${item.kind} · ${new Date(item.occurred_at).toLocaleString()}`));
      pane.append(row);
    }
  } catch (e) {
    pane.replaceChildren(el("p", { class: "muted" }, "History is temporarily unavailable."));
  }
}

function renderWire() {
  const pane = $("pane-wire");
  pane.replaceChildren();
  if (!state.news.length) return pane.append(el("p", { class: "muted" }, "No headlines loaded."));
  for (const n of state.news) {
    const row = el("div", { class: "item" });
    const a = el("a", { href: n.url, target: "_blank", rel: "noopener noreferrer" }, n.title);
    row.append(a, el("div", { class: "meta" }, `${n.domain}${n.country ? " · " + n.country : ""}`));
    pane.append(row);
  }
}

function renderQuakes() {
  const pane = $("pane-quakes");
  pane.replaceChildren();
  const list = state.quakes.slice(0, 40);
  const flagged = new Set(state.flagged.flatMap((c) => c.ids));
  for (const q of list) {
    const row = el("div", { class: "item" });
    const a = el("a", { href: q.url, target: "_blank", rel: "noopener noreferrer" }, q.place);
    const mag = el("span", { class: "mag" + (q.mag >= 6 ? " big" : "") }, q.mag.toFixed(1));
    const line = el("div");
    line.append(mag, a);
    if (flagged.has(q.id)) line.append(el("span", { class: "pill" }, "CLUSTER"));
    row.append(line, el("div", { class: "meta" }, `${ago(q.time)} · depth ${Math.round(q.depth)} km`));
    pane.append(row);
  }
}

function renderSignals() {
  const pane = $("pane-signals");
  pane.replaceChildren();
  pane.append(
    el("p", { class: "muted" },
      "Cells of roughly 5° × 5° whose last-24h quake count is at least 3× their recent daily average (and 4 or more). Rule-based screening, not a forecast.")
  );
  if (!state.flagged.length) return pane.append(el("p", {}, "No clusters flagged right now."));
  for (const c of state.flagged.slice(0, 15)) {
    const row = el("div", { class: "item" });
    row.append(
      el("div", {}, `${c.place}`),
      el("div", { class: "meta" }, `${c.count} quakes in 24h vs ${c.baseline}/day baseline · max M${c.maxMag.toFixed(1)}`)
    );
    pane.append(row);
  }
}

/* ---------- AI briefing ---------- */
$("briefBtn").addEventListener("click", async () => {
  const btn = $("briefBtn"), out = $("briefOut");
  btn.disabled = true;
  out.className = "brief";
  out.textContent = "Writing briefing…";
  try {
    const r = await fetch("/api/brief", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        headlines: state.news.slice(0, 20).map((n) => n.title),
        quakes: state.quakes.filter((q) => q.mag >= 5).slice(0, 10).map((q) => `M${q.mag.toFixed(1)} ${q.place} (${ago(q.time)})`),
        clusters: state.flagged.slice(0, 5).map((c) => `${c.place}: ${c.count} quakes in 24h vs ${c.baseline}/day`),
      }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    out.textContent = (await r.json()).brief;
  } catch (e) {
    out.className = "brief err";
    out.textContent = `Could not generate a briefing (${e.message}). Check the AI and Supabase configuration.`;
  } finally {
    btn.disabled = false;
  }
});

/* ---------- tabs + boot ---------- */
document.querySelectorAll(".tabs button").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    document.querySelectorAll(".pane").forEach((p) => (p.hidden = p.id !== "pane-" + b.dataset.tab));
    if (b.dataset.tab === "history") renderHistory();
  })
);

const status = (msg) => ($("status").textContent = msg);
async function safe(name, fn) {
  try { await fn(); return true; }
  catch (e) { console.error(name, e); return false; }
}

async function refreshSlow() {
  const ok = await safe("live data", loadQuakes);
  status(ok ? `LIVE · updated ${new Date().toLocaleTimeString()}` : "FEED CONNECTION ISSUE · retrying");
}

drawBase();
refreshSlow();
setInterval(refreshSlow, 5 * 60 * 1000);
