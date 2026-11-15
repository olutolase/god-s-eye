const timeout = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
const clean = (value, max = 180) => String(value || "").replace(/[<>\\u0000-\\u001f]/g, " ").slice(0, max).trim();
const xmlText = (value = "") => String(value).replace(/<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>/g, "$1").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\\s+/g, " ").trim();
function rssItems(xml) {
  return [...xml.matchAll(/<item\\b[\\s\\S]*?<\\/item>/gi)].map((m) => {
    const get = (tag) => xmlText((m[0].match(new RegExp("<" + tag + "(?:\\\\s[^>]*)?>([\\\\s\\S]*?)</" + tag + ">", "i")) || [])[1] || "");
    return { title: get("title"), description: get("description"), url: get("link"), published: get("pubDate") };
  }).filter(x => x.title);
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const place = clean(req.query?.place, 100);
  if (place.length < 2) return res.status(400).json({ error: "Enter a city or country." });
  try {
    const geoResponse = await timeout("https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(place) + "&count=1&language=en&format=json");
    if (!geoResponse.ok) throw new Error("Geocoding unavailable");
    const geo = (await geoResponse.json()).results?.[0];
    if (!geo) return res.status(404).json({ error: "I couldn't find that place. Try a city or country name." });
    const label = [geo.name, geo.admin1, geo.country].filter(Boolean).join(", ");
    const countryCode = String(geo.country_code || "").toUpperCase();
    const weatherUrl = "https://api.open-meteo.com/v1/forecast?latitude=" + geo.latitude + "&longitude=" + geo.longitude + "&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1";
    const conflictQuery = '"' + geo.name + '" OR "' + (geo.country || geo.name) + '"';
    const conflictUrl = "https://api.gdeltproject.org/api/v2/doc/doc?query=" + encodeURIComponent("(" + conflictQuery + ") (conflict OR attack OR violence OR clashes OR security)") + "&mode=artlist&maxrecords=8&format=json&timespan=7d&sort=hybridrel";
    const whoUrl = "https://www.who.int/feeds/entity/csr/don/en/rss.xml";
    const tasks = await Promise.allSettled([
      timeout(weatherUrl).then(r => { if (!r.ok) throw new Error("Weather unavailable"); return r.json(); }),
      timeout(conflictUrl).then(r => { if (!r.ok) throw new Error("Conflict feed unavailable"); return r.json(); }),
      timeout(whoUrl).then(r => { if (!r.ok) throw new Error("WHO feed unavailable"); return r.text(); }),
      process.env.CLOUDFLARE_API_TOKEN ? timeout("https://api.cloudflare.com/client/v4/radar/annotations/outages?limit=100&dateRange=7d&format=json", { headers: { Authorization: "Bearer " + process.env.CLOUDFLARE_API_TOKEN } }).then(r => { if (!r.ok) throw new Error("Radar unavailable"); return r.json(); }) : Promise.resolve(null)
    ]);
    const weather = tasks[0].status === "fulfilled" ? tasks[0].value : null;
    const conflict = tasks[1].status === "fulfilled" ? (tasks[1].value.articles || []).slice(0, 6).map(a => ({ title: clean(a.title, 240), source: clean(a.domain, 80), url: a.url, seen: a.seendate })) : [];
    const who = tasks[2].status === "fulfilled" ? rssItems(tasks[2].value).filter(item => (item.title + " " + item.description).toLowerCase().includes((geo.country || geo.name).toLowerCase()) || item.title.toLowerCase().includes("africa")).slice(0, 5) : [];
    const outageAnnotations = tasks[3].status === "fulfilled" && tasks[3].value ? (tasks[3].value.result?.annotations || []).filter(a => (a.locations || []).includes(countryCode)).slice(0, 8).map(a => ({ title: clean(a.description || a.outage?.outageCause || "Internet connectivity disruption", 220), scope: clean(a.scope, 120), start: a.startDate, end: a.endDate, url: a.linkedUrl })) : null;
    const weatherCurrent = weather?.current ? { temperature: weather.current.temperature_2m, feelsLike: weather.current.apparent_temperature, humidity: weather.current.relative_humidity_2m, precipitation: weather.current.precipitation, wind: weather.current.wind_speed_10m, code: weather.current.weather_code, time: weather.current.time, timezone: weather.timezone, high: weather.daily?.temperature_2m_max?.[0], low: weather.daily?.temperature_2m_min?.[0], rainChance: weather.daily?.precipitation_probability_max?.[0] } : null;
    return res.status(200).json({
      place: label, coordinates: { lat: geo.latitude, lon: geo.longitude }, countryCode,
      generatedAt: new Date().toISOString(),
      weather: { status: weatherCurrent ? "available" : "unavailable", current: weatherCurrent, source: "Open-Meteo" },
      security: { status: tasks[1].status === "fulfilled" ? "available" : "unavailable", reports: conflict, source: "GDELT · last 7 days" },
      outbreaks: { status: tasks[2].status === "fulfilled" ? "available" : "unavailable", reports: who, source: "WHO Disease Outbreak News" },
      internet: { status: outageAnnotations ? "available" : "not_configured", reports: outageAnnotations || [], note: outageAnnotations ? "Cloudflare Radar outage annotations for this country, last 7 days." : "Add CLOUDFLARE_API_TOKEN to enable country-level outage annotations. No outage conclusion can be drawn without this feed.", source: "Cloudflare Radar" }
    });
  } catch (error) {
    console.error("Travel check failed:", error.message);
    return res.status(502).json({ error: "Travel Check is temporarily unavailable. Please try again." });
  }
}