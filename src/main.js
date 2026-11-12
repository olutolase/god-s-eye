import Globe from "globe.gl";
import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";

const $ = (id) => document.getElementById(id);
const state = { quakes: [], flagged: [], news: [], iss: null, globe: null, selectedSource: "all", activeTab: "wire" };
const countries = feature(world, world.objects.countries).features;
const countryNames = new Map(countries.map((f) => [String(f.properties.name || "").toLowerCase(), f]));

const locations = [
  ["nigeria",9.08,8.67],["lagos",6.52,3.38],["abuja",9.06,7.49],["ghana",7.95,-1.02],["accra",5.56,-0.2],
  ["kenya",0.02,37.91],["nairobi",-1.29,36.82],["south africa",-30.56,22.94],["johannesburg",-26.2,28.04],
  ["sudan",12.86,30.22],["ethiopia",9.15,40.49],["somalia",5.15,46.2],["congo",-0.23,15.83],
  ["israel",31.05,34.85],["gaza",31.5,34.47],["palestine",31.95,35.23],["jerusalem",31.77,35.21],
  ["iran",32.43,53.69],["tehran",35.69,51.39],["iraq",33.22,43.68],["baghdad",33.31,44.36],
  ["lebanon",33.85,35.86],["beirut",33.89,35.5],["syria",34.8,38.99],["ukraine",48.38,31.17],
  ["kyiv",50.45,30.52],["russia",61.52,105.32],["moscow",55.75,37.62],["china",35.86,104.19],
  ["beijing",39.9,116.4],["taiwan",23.7,121.0],["india",20.59,78.96],["delhi",28.61,77.21],
  ["pakistan",30.38,69.35],["afghanistan",33.94,67.71],["japan",36.2,138.25],["tokyo",35.68,139.69],
  ["south korea",35.91,127.77],["north korea",40.34,127.51],["australia",-25.27,133.78],["sydney",-33.87,151.21],
  ["new zealand",-40.9,174.89],["united states",37.09,-95.71],["usa",37.09,-95.71],["washington",38.91,-77.04],
  ["new york",40.71,-74.01],["california",36.78,-119.42],["canada",56.13,-106.35],["mexico",23.63,-102.55],
  ["brazil",-14.24,-51.93],["argentina",-38.42,-63.62],["venezuela",6.42,-66.59],["colombia",4.57,-74.3],
  ["united kingdom",55.38,-3.44],["britain",55.38,-3.44],["london",51.51,-0.13],["france",46.23,2.21],
  ["paris",48.86,2.35],["germany",51.17,10.45],["berlin",52.52,13.4],["poland",51.92,19.15],
  ["italy",41.87,12.57],["rome",41.9,12.5],["spain",40.46,-3.75],["sweden",60.13,18.64],
  ["norway",60.47,8.47],["finland",61.92,25.75],["turkey",38.96,35.24],["ankara",39.93,32.86],
  ["egypt",26.82,30.8],["cairo",30.04,31.24],["morocco",31.79,-7.09],["algeria",28.03,1.66],
  ["tunisia",33.89,9.54],["libya",26.34,17.23],["saudi arabia",23.89,45.08],["yemen",15.55,48.52],
  ["qatar",25.35,51.18],["doha",25.29,51.53],["united arab emirates",23.42,53.85],["dubai",25.2,55.27],
  ["philippines",12.88,121.77],["indonesia",-0.79,113.92],["thailand",15.87,100.99],["vietnam",14.06,108.28],
  ["myanmar",21.91,95.96],["bangladesh",23.68,90.36],["sri lanka",7.87,80.77]
].map(([name, lat, lng]) => ({ name, lat, lng }));

function locateHeadline(text) {
  const value = String(text || "").toLowerCase();
  const found = locations.filter((p) => new RegExp("\\b" + p.name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&") + "\\b", "i").test(value));
  return found.sort((a,b) => b.name.length - a.name.length)[0] || null;
}

function ago(value) {
  const date = new Date(value || Date.now());
  const mins = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  return mins < 60 ? mins + "m ago" : mins < 1440 ? Math.round(mins / 60) + "h ago" : Math.round(mins / 1440) + "d ago";
}
function node(tag, cls, value) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (value !== undefined) n.textContent = value;
  return n;
}
function safeLink(url, title) {
  const a = node("a", "", title);
  a.href = url || "#";
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

function initGlobe() {
  const globe = Globe()( $("globeViz") )
    .backgroundColor("#070c12")
    .showAtmosphere(true)
    .atmosphereColor("#276b86")
    .atmosphereAltitude(0.18)
    .polygonsData(countries)
    .polygonCapColor(() => "#142333")
    .polygonSideColor(() => "rgba(5,12,20,0.18)")
    .polygonStrokeColor(() => "#294155")
    .polygonAltitude(0.006)
    .pointsData([])
    .pointLat("lat")
    .pointLng("lng")
    .pointColor("color")
    .pointRadius("radius")
    .pointAltitude("altitude")
    .pointResolution(12)
    .pointLabel((d) => d.label)
    .onPointClick((d) => {
      if (d.kind === "news") selectNews(d.item);
      else if (d.kind === "quake") selectQuake(d.item);
      else if (d.kind === "iss") selectIss();
    });
  const controls = globe.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.28;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 115;
  controls.maxDistance = 500;
  globe.pointOfView({ lat: 15, lng: 5, altitude: 2.25 }, 0);
  state.globe = globe;
  $("resetView").addEventListener("click", () => globe.pointOfView({ lat: 15, lng: 5, altitude: 2.25 }, 700));
  window.addEventListener("resize", () => globe.width($("globeViz").clientWidth).height($("globeViz").clientHeight));
}

function pointData() {
  const newsPoints = state.news.filter((n) => n.location).map((n) => ({
    lat: n.location.lat, lng: n.location.lng, color: "#52d6c7", radius: 0.34, altitude: 0.012,
    label: n.location.name + " · " + n.source + " · " + n.title, kind: "news", item: n
  }));
  const quakePoints = state.quakes.filter((q) => Number.isFinite(q.lat) && Number.isFinite(q.lon)).slice(0, 350).map((q) => ({
    lat: q.lat, lng: q.lon, color: q.mag >= 5 ? "#ff526d" : "#ffad57",
    radius: Math.max(0.18, Math.min(0.75, Number(q.mag || 2) * 0.1)), altitude: 0.009,
    label: "M" + Number(q.mag).toFixed(1) + " · " + q.place, kind: "quake", item: q
  }));
  const issPoint = state.iss ? [{
    lat: state.iss.lat, lng: state.iss.lon, color: "#76aaff", radius: 0.65, altitude: 0.025,
    label: "International Space Station", kind: "iss", item: state.iss
  }] : [];
  state.globe.pointsData([...newsPoints, ...quakePoints, ...issPoint]);
  renderStats();
}

function selectNews(n) {
  if (!n) return;
  const panel = $("selectedEvent");
  panel.replaceChildren(node("span", "eyebrow", (n.source || "NEWS").toUpperCase() + " · " + (n.location ? n.location.name.toUpperCase() : "GLOBAL")),
    node("h3", "", n.title), node("p", "selected-meta", ago(n.published) + " · " + (n.location ? "Approximate headline location" : "No reliable location detected")),
    safeLink(n.url, "OPEN ORIGINAL REPORT ↗"));
  if (n.location) state.globe.pointOfView({ lat: n.location.lat, lng: n.location.lng, altitude: 1.4 }, 900);
}
function selectQuake(q) {
  $("selectedEvent").replaceChildren(node("span", "eyebrow", "USGS EARTHQUAKE"),
    node("h3", "", "M" + Number(q.mag).toFixed(1) + " · " + q.place),
    node("p", "selected-meta", ago(q.time) + " · Depth " + Math.round(q.depth) + " km"),
    safeLink(q.url, "OPEN USGS EVENT ↗"));
  state.globe.pointOfView({ lat: q.lat, lng: q.lon, altitude: 1.35 }, 900);
}
function selectIss() {
  $("selectedEvent").replaceChildren(node("span", "eyebrow", "ORBITAL TRACKING"),
    node("h3", "", "International Space Station"),
    node("p", "selected-meta", "Altitude " + (state.iss.alt || "—").toFixed(1) + " km · Velocity " + (state.iss.vel || "—").toFixed(0) + " km/h"));
  state.globe.pointOfView({ lat: state.iss.lat, lng: state.iss.lon, altitude: 1.5 }, 900);
}
function renderStats() {
  $("stats").replaceChildren(
    stat(state.quakes.length, "EARTHQUAKES"),
    stat(state.news.length, "HEADLINES"),
    stat(state.news.filter((n) => n.location).length, "GEOLOCATED"),
    stat(state.iss ? "LIVE" : "—", "ISS TRACKING")
  );
}
function stat(value, label) {
  const d = node("div", "stat");
  d.append(node("strong", "", String(value)), node("span", "", label));
  return d;
}
function renderWire() {
  const pane = $("pane-wire");
  pane.replaceChildren();
  const news = state.news.filter((n) => state.selectedSource === "all" || n.source === state.selectedSource);
  $("feedCount").textContent = news.length + " ITEMS";
  if (!news.length) pane.append(node("p", "muted", "No headlines are available from the selected sources right now."));
  for (const n of news) {
    const row = node("article", "news-item" + (n.location ? " has-location" : ""));
    const source = node("div", "news-source");
    source.append(node("span", "source-name", n.source), node("span", "news-time", ago(n.published)));
    const title = node("button", "headline", n.title);
    title.type = "button";
    title.addEventListener("click", () => selectNews(n));
    row.append(source, title);
    if (n.location) {
      const loc = node("button", "location-tag", "◎ " + n.location.name + " · VIEW");
      loc.type = "button";
      loc.addEventListener("click", () => selectNews(n));
      row.append(loc);
    } else row.append(node("span", "location-tag muted-tag", "GLOBAL / LOCATION UNCONFIRMED"));
    const link = safeLink(n.url, "READ SOURCE ↗");
    link.className = "source-link";
    row.append(link);
    pane.append(row);
  }
}
function renderQuakes() {
  const pane = $("pane-quakes");
  pane.replaceChildren();
  for (const q of state.quakes.slice(0, 50)) {
    const row = node("article", "news-item");
    row.append(node("span", "source-name", "USGS · M" + Number(q.mag).toFixed(1)));
    const title = node("button", "headline", q.place);
    title.type = "button";
    title.addEventListener("click", () => selectQuake(q));
    row.append(title, node("span", "news-time", ago(q.time) + " · depth " + Math.round(q.depth) + " km"));
    pane.append(row);
  }
  if (!state.quakes.length) pane.append(node("p", "muted", "No earthquake observations available."));
}
function renderSignals() {
  const pane = $("pane-signals");
  pane.replaceChildren(node("p", "muted", "Rule-based screening of recent earthquake clusters. This is not earthquake prediction."));
  if (!state.flagged.length) pane.append(node("p", "", "No unusual clusters flagged right now."));
  for (const c of state.flagged.slice(0, 20)) {
    const row = node("article", "news-item");
    row.append(node("span", "source-name", "SEISMIC SIGNAL"), node("strong", "headline-text", c.place),
      node("span", "news-time", c.count + " events in 24h · max M" + c.maxMag.toFixed(1)));
    pane.append(row);
  }
}
async function renderHistory() {
  const pane = $("pane-history");
  pane.replaceChildren(node("p", "muted", "Loading archived observations…"));
  try {
    const r = await fetch("/api/history");
    const d = await r.json();
    pane.replaceChildren(node("p", "muted", d.enabled ? "Database archive · " + d.count + " recent records" : "Historical storage is not configured. Add Supabase environment variables to enable it."));
    for (const item of d.events || []) {
      const row = node("article", "news-item");
      row.append(node("strong", "headline-text", item.title), node("span", "news-time", item.kind + " · " + new Date(item.occurred_at).toLocaleString()));
      pane.append(row);
    }
  } catch {
    pane.replaceChildren(node("p", "muted", "History is temporarily unavailable."));
  }
}
function showTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  document.querySelectorAll(".pane").forEach((p) => { p.hidden = p.id !== "pane-" + tab; });
  if (tab === "history") renderHistory();
}
function bindControls() {
  document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  document.querySelectorAll(".filter").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach((x) => x.classList.toggle("active", x === b));
    state.selectedSource = b.dataset.source;
    renderWire();
  }));
}
async function refresh() {
  try {
    const response = await fetch("/api/live", { cache: "no-store" });
    if (!response.ok) throw new Error("Feed request failed: " + response.status);
    const d = await response.json();
    state.quakes = (d.quakes || []).sort((a,b) => b.time-a.time);
    state.news = (d.news || []).map((n) => ({ ...n, location: locateHeadline(n.title + " " + (n.summary || "")) }))
      .sort((a,b) => new Date(b.published || 0) - new Date(a.published || 0));
    state.iss = d.iss || null;
    state.flagged = d.flagged || [];
    pointData();
    renderWire();
    renderQuakes();
    renderSignals();
    $("lastUpdate").textContent = "UPDATED " + new Date(d.generatedAt || Date.now()).toLocaleTimeString();
    $("status").textContent = "LIVE FEEDS CONNECTED";
    $("status").classList.add("is-live");
  } catch (error) {
    console.error(error);
    $("status").textContent = "FEED CONNECTION ISSUE · RETRYING";
    $("lastUpdate").textContent = "FEED UPDATE FAILED";
  }
}
function updateClock() {
  $("clock").textContent = new Date().toISOString().slice(11,19) + " UTC";
}
initGlobe();
bindControls();
refresh();
updateClock();
setInterval(updateClock, 1000);
setInterval(refresh, 5 * 60 * 1000);