const json = async (url, options={}) => {
  const r = await fetch(url, { ...options, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error("Upstream " + r.status);
  return r.json();
};
let cache = { at: 0, data: null };
export default async function handler(req,res) {
  if (req.method !== "GET") return res.status(405).end();
  res.setHeader("Cache-Control","s-maxage=180, stale-while-revalidate=300");
  if (cache.data && Date.now()-cache.at < 180000) return res.status(200).json(cache.data);
  const now = Math.floor(Date.now()/1000);
  const [air, weather, markets, fires] = await Promise.allSettled([
    json("https://opensky-network.org/api/states/all"),
    json("https://api.weather.gov/alerts/active?status=actual&message_type=alert,update&limit=100",{headers:{"User-Agent":"GodsEye/1.0 contact: public-dashboard"}}),
    Promise.all(["SPY","QQQ","^GSPC","^IXIC","GC=F","CL=F"].map(async symbol => {
      const d=await json("https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(symbol)+"?range=1d&interval=5m");
      const q=d.chart?.result?.[0]; const meta=q?.meta; const price=meta?.regularMarketPrice; const prev=meta?.chartPreviousClose || meta?.previousClose;
      return {symbol,price:Number(price||0).toFixed(2),change:prev?((price-prev)/prev*100).toFixed(2)+"%":""};
    })),
    process.env.NASA_FIRMS_MAP_KEY ? fetch("https://firms.modaps.eosdis.nasa.gov/api/area/csv/"+process.env.NASA_FIRMS_MAP_KEY+"/VIIRS_SNPP_NRT/-180,-90,180,90/1").then(r=>{if(!r.ok)throw new Error("FIRMS "+r.status);return r.text();}) : Promise.resolve("")
  ]);
  let planes=[];
  if(air.status==="fulfilled") planes=(air.value.states||[]).filter(s=>s[5]!=null&&s[6]!=null&&s[8]===false).slice(0,1200).map(s=>({icao24:s[0],callsign:String(s[1]||"").trim(),origin:s[2],lat:s[6],lon:s[5],alt:s[7],velocity:s[9],heading:s[10],onGround:s[8]}));
  let storms=[];
  if(weather.status==="fulfilled") storms=(weather.value.features||[]).slice(0,100).map(f=>({title:f.properties.event,description:f.properties.headline||f.properties.description,area:f.properties.areaDesc,url:f.properties.web,lat:f.geometry?.coordinates?.[0]?.[0]?.[1],lon:f.geometry?.coordinates?.[0]?.[0]?.[0]})).filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lon));
  let fireRows=[];
  if(fires.status==="fulfilled"&&fires.value){const lines=fires.value.trim().split(/\r?\n/);const cols=lines.shift().split(",");fireRows=lines.slice(0,3000).map(line=>{const vals=line.split(",");const row=Object.fromEntries(cols.map((c,i)=>[c,vals[i]]));return {lat:Number(row.latitude),lon:Number(row.longitude),brightness:row.brightness,acq_date:row.acq_date,acq_time:row.acq_time};}).filter(f=>Number.isFinite(f.lat)&&Number.isFinite(f.lon));}
  const data={planes,fires:fireRows,storms,markets:markets.status==="fulfilled"?markets.value:[],status:{opensky:air.status,firms:process.env.NASA_FIRMS_MAP_KEY?(fires.status==="fulfilled"?"fulfilled":"rejected"):"key_required",weather:weather.status,markets:markets.status},generatedAt:new Date().toISOString()};
  cache={at:Date.now(),data}; return res.status(200).json(data);
}