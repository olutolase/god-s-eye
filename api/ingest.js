import { collectFeeds, saveSnapshot } from "./_lib/feeds.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).end();
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: "Unauthorized" });
  try {
    const snapshot = await collectFeeds();
    const archive = await saveSnapshot(snapshot);
    return res.status(200).json({ ok: true, feeds: snapshot.feedStatus, archive });
  } catch (error) {
    console.error("Scheduled ingest failed:", error);
    return res.status(500).json({ error: "Ingestion failed." });
  }
}
