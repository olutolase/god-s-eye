const USGS = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson";
const ISS = "https://api.wheretheiss.at/v1/satellites/25544";
const GDELT = "https://api.gdeltproject.org/api/v2/doc/doc?query=" +
  encodeURIComponent("(conflict OR earthquake OR outbreak OR protest OR attack) sourcelang:english") +
  "&mode=artlist&maxrecords=25&format=json&timespan=24h&sort=hybridrel";

function toIso(value) {
  if (!value) return new Date().toISOString();
  const text = String(value);
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  const parsed = compact ? `${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z` : text;
  const date = new Date(parsed);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

async function json(url) {
  const response = await fetch(url, { headers: { "user-agent": "GodsEye/1.0" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
  return response.json();
}

export async function collectFeeds() {
  const [quakesResult, newsResult, issResult] = await Promise.allSettled([json(USGS), json(GDELT), json(ISS)]);
  const quakes = quakesResult.status === "fulfilled"
    ? (quakesResult.value.features || []).map((f) => ({
        id: f.id, mag: f.properties.mag, place: f.properties.place || "Unknown",
        time: f.properties.time, url: f.properties.url,
        lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], depth: f.geometry.coordinates[2]
      })).filter((q) => q.mag != null).sort((a,b) => b.time-a.time) : [];
  const news = newsResult.status === "fulfilled"
    ? (newsResult.value.articles || []).map((a) => ({
        title: a.title, url: a.url, domain: a.domain, country: a.sourcecountry, seen: a.seendate
      })) : [];
  const issData = issResult.status === "fulfilled" ? issResult.value : null;
  const iss = issData ? { lat: issData.latitude, lon: issData.longitude, alt: issData.altitude, vel: issData.velocity } : null;
  return {
    quakes, news, iss, generatedAt: new Date().toISOString(),
    feedStatus: { earthquakes: quakesResult.status, headlines: newsResult.status, iss: issResult.status }
  };
}

export async function saveSnapshot(snapshot) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { enabled: false, saved: 0 };
  const headers = {
    apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json",
    prefer: "resolution=merge-duplicates,return=minimal"
  };
  let saved = 0;
  const events = [
    ...snapshot.quakes.map((q) => ({
      id: `usgs:${q.id}`, source: "USGS", kind: "earthquake",
      title: `M${Number(q.mag).toFixed(1)} — ${q.place}`,
      occurred_at: new Date(q.time).toISOString(), latitude: q.lat, longitude: q.lon,
      magnitude: q.mag, source_url: q.url, raw: q
    })),
    ...snapshot.news.map((n) => ({
      id: `gdelt:${encodeURIComponent(n.url || n.title).slice(0,180)}`, source: "GDELT",
      kind: "news", title: n.title, occurred_at: toIso(n.seen),
      source_url: n.url, raw: n
    }))
  ];
  for (let i = 0; i < events.length; i += 100) {
    const r = await fetch(`${url}/rest/v1/events?on_conflict=id`, {
      method: "POST", headers, body: JSON.stringify(events.slice(i, i + 100))
    });
    if (!r.ok) throw new Error(`Supabase event write failed: ${r.status}`);
    saved += Math.min(100, events.length - i);
  }
  if (snapshot.iss) {
    const r = await fetch(`${url}/rest/v1/iss_positions`, {
      method: "POST", headers: { ...headers, prefer: "return=minimal" },
      body: JSON.stringify({
        latitude: snapshot.iss.lat, longitude: snapshot.iss.lon,
        altitude_km: snapshot.iss.alt, velocity_kmh: snapshot.iss.vel
      })
    });
    if (!r.ok) throw new Error(`Supabase ISS write failed: ${r.status}`);
    saved++;
  }
  return { enabled: true, saved };
}
