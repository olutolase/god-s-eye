import { createHash } from "node:crypto";

async function allowBrief(ip) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
  const ipHash = createHash("sha256").update(`${process.env.RATE_LIMIT_SALT || key}:${ip}`).digest("hex");
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const check = await fetch(`${url}/rest/v1/api_usage?select=id&ip_hash=eq.${ipHash}&action=eq.brief&created_at=gte.${encodeURIComponent(since)}`, { headers });
  if (!check.ok) throw new Error("Rate-limit check failed");
  const used = await check.json();
  if (used.length >= 5) return false;
  const write = await fetch(`${url}/rest/v1/api_usage`, {
    method: "POST", headers: { ...headers, prefer: "return=minimal" },
    body: JSON.stringify({ ip_hash: ipHash, action: "brief" })
  });
  if (!write.ok) throw new Error("Rate-limit write failed");
  return true;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "Gemini is not configured. Add GEMINI_API_KEY in Vercel and redeploy." });
  try {
    const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
    const allowed = await allowBrief(ip);
    if (allowed === null) return res.status(503).json({ error: "Configure Supabase to enable protected AI briefings." });
    if (!allowed) return res.status(429).json({ error: "Briefing limit reached (5 per hour)." });
  } catch (error) {
    console.error("Briefing rate-limit error:", error.message);
    return res.status(503).json({ error: "AI briefing protection is unavailable. Try again later." });
  }
  const { headlines = [], quakes = [], clusters = [] } = req.body || {};
  const safeList = (items, max) => Array.isArray(items) ? items.slice(0, max).map((item) => String(item).slice(0, 240)) : [];
  const prompt = [
    "Write a concise global situational-awareness briefing of at most 150 words using only the observations supplied.",
    "Use headings: Headlines, Seismic activity, Watch items. Do not invent events, causes, or predictions. State uncertainty where relevant.",
    "",
    "HEADLINES:", ...safeList(headlines, 20).map((item) => "- " + item),
    "",
    "EARTHQUAKES M5+:", ...safeList(quakes, 10).map((item) => "- " + item),
    "",
    "FLAGGED CLUSTERS:", ...safeList(clusters, 5).map((item) => "- " + item)
  ].join("\n");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "You are a careful situational-awareness analyst. Use only supplied evidence and be explicit about uncertainty." }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 350 }
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("Gemini briefing error:", response.status, data?.error?.message || "unknown");
      if (response.status === 429) return res.status(429).json({ error: "Gemini's free-tier quota has been reached. Try again later." });
      throw new Error("Gemini API request failed");
    }
    const text = (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("\n").trim();
    if (!text) throw new Error("Gemini returned an empty briefing");
    return res.status(200).json({ brief: text, model });
  } catch (error) {
    console.error("AI briefing failed:", error.message);
    return res.status(502).json({ error: "Gemini could not generate the briefing. Check the API key, model access and quota." });
  }
}
