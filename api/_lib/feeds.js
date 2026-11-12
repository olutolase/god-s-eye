const USGS = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson";
const ISS = "https://api.wheretheiss.at/v1/satellites/25544";
const GDELT = "https://api.gdeltproject.org/api/v2/doc/doc?query=" +
  encodeURIComponent("(conflict OR earthquake OR outbreak OR protest OR attack) sourcelang:english") +
  "&mode=artlist&maxrecords=25&format=json&timespan=24h&sort=hybridrel";

const googleNews = (query) => "https://news.google.com/rss/search?q=" +
  encodeURIComponent(query) + "&hl=en-US&gl=US&ceid=US:en";
const RSS_FEEDS = [
  { source: "CBN News", url: googleNews("site:cbn.com/cbnnews OR site:cbn.com/news") },
  { source: "BBC News", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { source: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { source: "The Guardian", url: "https://www.theguardian.com/world/rss" },
  { source: "Reuters", url: googleNews("site:reuters.com world news") },
  { source: "Associated Press", url: googleNews("site:apnews.com world news") }
];

function stripTags(value = "") {
  return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, " ").trim();
}
function tag(item, name) {
  const match = item.match(new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "i"));
  return match ? stripTags(match[1]) : "";
}
async function json(url) {
  const response = await fetch(url, { headers: { "user-agent": "GodsEye/2.0" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("Upstream returned " + response.status);
  return response.json();
}
async function rss(feed) {
  const response = await fetch(feed.url, {
    headers: { "user-agent": "GodsEye/2.0 (public news feed reader)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(feed.source + " RSS returned " + response.status);
  const xml = await response.text();
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]);
  return items.map((item) => {
    const title = tag(item, "title");
    const url = tag(item, "link") || (item.match(/<link[^>]*href=["']([^"']+)["']/i) || [])[1] || "";
    const published = tag(item, "pubDate") || tag(item, "published") || tag(item, "updated");
    const summary = tag(item, "description") || tag(item, "summary") || tag(item, "content:encoded");
    return { title, url, source: feed.source, domain: new URL(feed.url).hostname.replace(/^www\./, ""), published, summary };
  }).filter((item) => item.title && item.url);
}
function toIso(value) {
  if (!value) return new Date().toISOString();
  const text = String(value);
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  const parsed = compact ? compact[1] + "-" + compact[2] + "-" + compact[3] + "T" + compact[4] + ":" + compact[5] + ":" + compact[6] + "Z" : text;
  const date = new Date(parsed);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}
export async function collectFeeds() {
  const [quakesResult, issResult, gdeltResult, ...rssResults] = await Promise.allSettled([
    json(USGS), json(ISS), json(GDELT), ...RSS_FEEDS.map(rss)
  ]);
  const quakes = quakesResult.status === "fulfilled"
    ? (quakesResult.value.features || []).map((f) => ({
        id: f.id, mag: f.properties.mag, place: f.properties.place || "Unknown",
        time: f.properties.time, url: f.properties.url,
        lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], depth: f.geometry.coordinates[2]
      })).filter((q) => q.mag != null).sort((a,b) => b.time-a.time) : [];
  const news = [];
  rssResults.forEach((result) => {
    if (result.status === "fulfilled") news.push(...result.value);
  });
  if (gdeltResult.status === "fulfilled") {
    news.push(...(gdeltResult.value.articles || []).map((a) => ({
      title: a.title, url: a.url, source: a.domain || "GDELT", domain: a.domain,
      published: toIso(a.seendate), summary: "", country: a.sourcecountry
    })));
  }
  const unique = new Map();
  for (const item of news) {
    const key = item.url || item.title;
    if (key && !unique.has(key)) unique.set(key, item);
  }
  const headlines = [...unique.values()].sort((a,b) => new Date(b.published || 0) - new Date(a.published || 0)).slice(0, 100);
  const issData = issResult.status === "fulfilled" ? issResult.value : null;
  const iss = issData ? { lat: issData.latitude, lon: issData.longitude, alt: issData.altitude, vel: issData.velocity } : null;
  return {
    quakes, news: headlines, iss, generatedAt: new Date().toISOString(),
    feedStatus: {
      earthquakes: quakesResult.status,
      headlines: rssResults.some((r) => r.status === "fulfilled") || gdeltResult.status === "fulfilled" ? "fulfilled" : "rejected",
      iss: issResult.status,
      sources: RSS_FEEDS.map((feed, i) => ({ name: feed.source, status: rssResults[i].status }))
    }
  };
}
export async function saveSnapshot(snapshot) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { enabled: false, saved: 0 };
  const headers = {
    apikey: key, authorization: "Bearer " + key, "content-type": "application/json",
    prefer: "resolution=merge-duplicates,return=minimal"
  };
  let saved = 0;
  const events = [
    ...snapshot.quakes.map((q) => ({
      id: "usgs:" + q.id, source: "USGS", kind: "earthquake",
      title: "M" + Number(q.mag).toFixed(1) + " — " + q.place,
      occurred_at: new Date(q.time).toISOString(), latitude: q.lat, longitude: q.lon,
      magnitude: q.mag, source_url: q.url, raw: q
    })),
    ...snapshot.news.map((n) => ({
      id: "news:" + encodeURIComponent(n.url || n.title).slice(0,180), source: n.source || "News",
      kind: "news", title: n.title, occurred_at: toIso(n.published),
      source_url: n.url, raw: n
    }))
  ];
  for (let i = 0; i < events.length; i += 100) {
    const r = await fetch(url + "/rest/v1/events?on_conflict=id", {
      method: "POST", headers, body: JSON.stringify(events.slice(i, i + 100))
    });
    if (!r.ok) throw new Error("Supabase event write failed: " + r.status);
    saved += Math.min(100, events.length - i);
  }
  if (snapshot.iss) {
    const r = await fetch(url + "/rest/v1/iss_positions", {
      method: "POST", headers: { ...headers, prefer: "return=minimal" },
      body: JSON.stringify({
        latitude: snapshot.iss.lat, longitude: snapshot.iss.lon,
        altitude_km: snapshot.iss.alt, velocity_kmh: snapshot.iss.vel
      })
    });
    if (!r.ok) throw new Error("Supabase ISS write failed: " + r.status);
    saved++;
  }
  return { enabled: true, saved };
}