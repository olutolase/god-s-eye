import { createHash } from "node:crypto";
const localAskUsage = new Map();
async function checkLimit(ip){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key){const now=Date.now(),recent=(localAskUsage.get(ip)||[]).filter(t=>now-t<3600000);if(recent.length>=10)return false;recent.push(now);localAskUsage.set(ip,recent);return true;}
 const headers={apikey:key,authorization:"Bearer "+key,"content-type":"application/json"};
 const hash=createHash("sha256").update((process.env.RATE_LIMIT_SALT||key)+":"+ip).digest("hex");
 const since=new Date(Date.now()-3600000).toISOString();
 const q=await fetch(url+"/rest/v1/api_usage?select=id&ip_hash=eq."+hash+"&action=eq.ask&created_at=gte."+encodeURIComponent(since),{headers});
 if(!q.ok)throw new Error("Rate-limit check failed");
 if((await q.json()).length>=10)return false;
 const w=await fetch(url+"/rest/v1/api_usage",{method:"POST",headers:{...headers,prefer:"return=minimal"},body:JSON.stringify({ip_hash:hash,action:"ask"})});
 if(!w.ok)throw new Error("Rate-limit write failed"); return true;
}
export default async function handler(req,res) {
  if(req.method!=="POST") return res.status(405).json({error:"POST only"});
  const key=process.env.ANTHROPIC_API_KEY;
  if(!key) return res.status(503).json({error:"Ask God's Eye requires ANTHROPIC_API_KEY in Vercel."});
  const question=String(req.body?.question||"").trim().slice(0,800);
  if(!question) return res.status(400).json({error:"Enter a question."});
  const ip=(req.headers["x-forwarded-for"]||req.socket?.remoteAddress||"unknown").split(",")[0].trim();
  try { const allowed=await checkLimit(ip); if(allowed===null)return res.status(503).json({error:"Configure Supabase to enable protected Ask requests."}); if(!allowed)return res.status(429).json({error:"Ask limit reached (10 questions per hour)."}); } catch(e) { console.error("Ask rate limit error",e.message); return res.status(503).json({error:"Ask request protection is unavailable."}); }
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