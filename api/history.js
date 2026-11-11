export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(200).json({ enabled: false, count: 0, events: [] });
  try {
    const response = await fetch(`${url}/rest/v1/events?select=id,kind,title,occurred_at,source_url&order=occurred_at.desc&limit=100`, {
      headers: { apikey: key, authorization: `Bearer ${key}` }
    });
    if (!response.ok) throw new Error(`Supabase read failed: ${response.status}`);
    const events = await response.json();
    return res.status(200).json({ enabled: true, count: events.length, events });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: "History is temporarily unavailable." });
  }
}
