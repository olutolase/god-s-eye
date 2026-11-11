import { collectFeeds, saveSnapshot } from "./_lib/feeds.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  try {
    const snapshot = await collectFeeds();
    let archive = { enabled: false, saved: 0 };
    try { archive = await saveSnapshot(snapshot); }
    catch (error) { console.error("Archive write failed:", error.message); }
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=240");
    return res.status(200).json({ ...snapshot, archive });
  } catch (error) {
    console.error("Live feed error:", error);
    return res.status(502).json({ error: "Live feeds are temporarily unavailable." });
  }
}
