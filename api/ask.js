export default async function handler(req,res) {
  if(req.method!=="POST") return res.status(405).json({error:"POST only"});
  const key=process.env.ANTHROPIC_API_KEY;
  if(!key) return res.status(503).json({error:"Ask God's Eye requires ANTHROPIC_API_KEY in Vercel."});
  const question=String(req.body?.question||"").trim().slice(0,800);
  if(!question) return res.status(400).json({error:"Enter a question."});
  const context=req.body?.context||{};
  const compact=(arr,n)=>Array.isArray(arr)?arr.slice(0,n).map(x=>JSON.stringify(x).slice(0,500)): [];
  const prompt=[
    "You are Ask God's Eye, an evidence-grounded global situational-awareness assistant.",
    "Answer using ONLY the live context supplied below. Never invent events, locations, vessel counts, flight routes, causes, or forecasts. Clearly state when data is missing, delayed, approximate, or not configured. Distinguish verified facts from inference. Use concise plain language.",
    "If asked what is happening near a location, prioritize matching observations and say if none were supplied. Never present an estimated aircraft direction as an observed flight path.",
    "QUESTION:",question,
    "LIVE HEADLINES:",...compact(context.news,35),
    "EARTHQUAKES:",...compact(context.quakes,25),
    "AIRCRAFT:",...compact(context.planes,15),
    "STORMS:",...compact(context.storms,15),
    "FIRES:",...compact(context.fires,15),
    "MARKETS:",...compact(context.markets,12),
    "HISTORY:",...compact(context.history,15)
  ].join("\n");
  try {
    const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:process.env.ANTHROPIC_MODEL||"claude-sonnet-4-5",max_tokens:700,messages:[{role:"user",content:prompt}]})});
    const d=await r.json(); if(!r.ok) throw new Error(d.error?.message||"Claude API "+r.status);
    return res.status(200).json({answer:(d.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("\n")});
  } catch(e){console.error("Ask God's Eye failed",e.message);return res.status(502).json({error:"Claude could not answer right now. Check the Anthropic API key and model setting."});}
}