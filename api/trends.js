function extract(xml, tag) {
  const m = xml.match(new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">", "i"));
  return m ? m[1].replace(/<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>/g, "$1").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim() : "";
}
async function readTrends(geo) {
  const response = await fetch("https://trends.google.com/trending/rss?geo=" + geo, { signal: AbortSignal.timeout(9000), headers: { "user-agent": "GodsEye/2.0" } });
  if (!response.ok) throw new Error("Trends feed unavailable");
  const xml = await response.text();
  return [...xml.matchAll(/<item\\b[\\s\\S]*?<\\/item>/gi)].map(m => {
    const block = m[0];
    const get = (tag) => { const x = block.match(new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">", "i")); return x ? x[1].replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").trim() : ""; };
    return { title: get("title"), traffic: get("ht:approx_traffic"), published: get("pubDate"), url: get("ht:news_item_url") };
  }).filter(x => x.title).slice(0, 12);
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=1800");
  const results = await Promise.allSettled([readTrends("NG"), readTrends("US")]);
  return res.status(200).json({
    nigeria: results[0].status === "fulfilled" ? results[0].value : [],
    global: results[1].status === "fulfilled" ? results[1].value : [],
    status: { nigeria: results[0].status, global: results[1].status },
    generatedAt: new Date().toISOString(),
    platforms: {
      x: { label: "X", url: "https://x.com/explore", note: "Open X Explore for its live trend ranking." },
      instagram: { label: "Instagram", url: "https://www.instagram.com/explore/", note: "Explore page; rankings are personalised and not exposed as a public trends feed." },
      facebook: { label: "Facebook", url: "https://www.facebook.com/watch/", note: "Open Facebook discovery; no public country-wide trending API is available here." }
    }
  });
}