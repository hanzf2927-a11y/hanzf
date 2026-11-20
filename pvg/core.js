/* MDV Live – gemeinsamer Kern (aus der Desktop-Version übernommen) */
"use strict";
const D = window.MDV_DATA;
const API = "https://api.transitous.org/api/v1";
const BBOX = {s:50.93, w:11.45, n:51.33, e:12.33};   // Burgenlandkreis
const RAIL = new Set(["BUS","COACH"]);   // hier: Busse
const CATS = [{k:"BUS",t:"Linienbus"},{k:"PLUS",t:"PlusBus"}];
const CAT_FALLBACK = {BUS:"#8b98a9",PLUS:"#8b98a9"};
const PALETTE = ["#e8590c","#2f9e44","#1c7ed6","#ae3ec9","#f08c00","#0c8599","#d6336c","#5c940d","#4263eb","#c2255c","#099268","#e67700","#7048e8","#a61e4d","#1098ad","#74b816","#f76707","#3b5bdb","#9c36b5","#0b7285","#d9480f","#2b8a3e","#364fc7","#862e9c","#e64980","#40c057","#fab005","#15aabf","#be4bdb","#fd7e14"];

/* ---------- Linien & Farben ---------- */
const norm = s => (s||"").replace(/\s+/g,"").replace(/^\+/,"").toUpperCase();
const catOf = r => { const l = typeof lineByKey !== "undefined" && lineByKey.get(r); return l ? l.cat : "BUS"; };
let pi = 0;
D.lines.forEach(l => {
  if (!l.color || !/^#[0-9a-f]{3,6}$/i.test(l.color)) l.color = PALETTE[pi++ % PALETTE.length];
  l.key = norm(l.ref);
});
const lineByKey = new Map(D.lines.map(l => [l.key, l]));
function colorFor(ref){
  const k = norm(ref); const l = lineByKey.get(k);
  if (l) return l.color;
  // Linien, die nicht in OSM stehen: feste Farbe aus der Palette per Liniennummer
  let h = 0; for (const ch of k) h = (h*31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function textOn(hex){
  const h = hex.replace("#",""); const f = h.length===3 ? h.split("").map(c=>c+c).join("") : h;
  const r=parseInt(f.slice(0,2),16), g=parseInt(f.slice(2,4),16), b=parseInt(f.slice(4,6),16);
  return (0.299*r+0.587*g+0.114*b) > 165 ? "#111" : "#fff";
}

/* ---------- Fahrzeug: Linienbus der PVG ----------
   Gezeichnete Seitenansicht in Weiß mit einem Streifen in der Linienfarbe. */
const TYPES = {
  bus:  {name:"Linienbus", br:"Solobus, ca. 12 m", kind:"Stadt- und Regionalverkehr", wiki:"Omnibus",
    desc:"Niederflur-Linienbus, wie er im Stadt- und Regionalverkehr der PVG Burgenlandkreis eingesetzt wird.", q:"", d:{len:46, high:false}},
  plus: {name:"PlusBus", br:"Überlandbus", kind:"Schnelle Regionalverbindung im MDV", wiki:"PlusBus",
    desc:"PlusBus-Linien verbinden die Städte des Kreises im festen Takt, auch am Wochenende, mit kurzen Fahrzeiten.", q:"", d:{len:48, high:true}},
  generic: {name:"Linienbus", br:"", kind:"", wiki:"", desc:"", q:"", d:{len:46, high:false}}
};
const PVG_RX = /PVG Burgenland|Personenverkehrsgesellschaft Burgenland/i;
function typeOf(tr){ const l = lineByKey.get(tr.key); return l && l.cat === "PLUS" ? "plus" : "bus"; }
function liveryOf(tr, type){ return {body:"#f3f5f7", band:"#1f2630", stripe: colorFor(tr.ref)}; }

/* Seitenansicht eines Busses, Front zeigt nach rechts */
function trainSvg(type, lv, h){
  const d = (TYPES[type] || TYPES.bus).d, L = d.len, H = 20, top = d.high ? 3 : 4, bot = 16.5;
  let o = "";
  // Karosserie mit abgerundeter Front
  o += `<path d="M1,${top+2} Q1,${top} 3,${top} H${L-5} Q${L},${top} ${L},${top+5} V${bot} H1 Z" fill="${lv.body}" stroke="rgba(0,0,0,.55)" stroke-width=".6"/>`;
  // Fensterband und Frontscheibe
  o += `<rect x="3" y="${top+2}" width="${L-10}" height="${d.high?5:5.6}" rx=".8" fill="${lv.band}"/>`;
  o += `<path d="M${L-6},${top+1.6} H${L-2.2} Q${L-.6},${top+2} ${L-.6},${top+5} V${top+9} H${L-6} Z" fill="${lv.band}"/>`;
  // Streifen in Linienfarbe
  o += `<rect x="1" y="${bot-4.2}" width="${L-1}" height="1.8" fill="${lv.stripe}"/>`;
  // Türen
  for (const x of [L-11, L*0.45]) o += `<rect x="${x}" y="${top+2}" width="3.2" height="${bot-top-2.4}" fill="rgba(0,0,0,.30)"/>`;
  // Räder
  for (const x of [8, L-10]) o += `<circle cx="${x}" cy="${bot}" r="2.6" fill="#1a1d22"/><circle cx="${x}" cy="${bot}" r="1" fill="#8a929c"/>`;
  o += `<circle cx="${L-1.2}" cy="${bot-2}" r=".8" fill="#fff6c8"/>`;
  const total = L + 2, w = Math.round(total * h / H);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -1 ${total} ${H+1}" width="${w}" height="${Math.round(h*(H+1)/H)}" aria-hidden="true">${o}</svg>`;
}
/* Fotos von Wikimedia Commons (werden beim Öffnen der Zugkarte geladen) */
const photoCache = {};
function photoKey(type, agency){ return type + (type === "talent2" && /abellio/i.test(agency||"") ? "-ab" : ""); }
async function loadPhoto(type, agency){
  const key = photoKey(type, agency);
  if (photoCache[key]) return photoCache[key];
  const T = TYPES[type]; if (!T.q && !T.wiki) return null;
  const file = key.endsWith("-ab") ? T.qab : T.q;
  try{ const c = JSON.parse(localStorage.getItem("mdv-photo2-"+key)||"null"); if (c && Date.now()-c.t < 7*864e5) return photoCache[key] = c; }catch(_){}
  let res = null;
  try{
    const u = "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640"+
      "&iiextmetadatafilter=LicenseShortName|Artist&titles="+encodeURIComponent("File:"+file);
    const r = await fetch(u); const j = await r.json();
    const pages = Object.values((j.query||{}).pages||{}).filter(p => p.imageinfo);
    const p = pages[0];
    if (p){ const ii = p.imageinfo[0], md = ii.extmetadata||{};
      const artist = (md.Artist ? md.Artist.value : "").replace(/<[^>]+>/g,"").trim();
      res = {src: ii.thumburl || ii.url, page: ii.descriptionurl, artist, license: md.LicenseShortName ? md.LicenseShortName.value : "", t: Date.now()}; }
  }catch(_){}
  if (!res && T.wiki){
    try{ const r = await fetch("https://de.wikipedia.org/api/rest_v1/page/summary/"+T.wiki); const j = await r.json();
      if (j.thumbnail) res = {src: (j.originalimage && j.originalimage.width < 1600 ? j.originalimage.source : j.thumbnail.source), page: j.content_urls && j.content_urls.desktop.page, artist:"Wikipedia-Artikelbild", license:"", t: Date.now()}; }catch(_){}
  }
  if (res){ photoCache[key] = res; try{ localStorage.setItem("mdv-photo2-"+key, JSON.stringify(res)); }catch(_){} }
  return res;
}

/* Fahrtverläufe nach und nach laden, um Betreiber und Ziel jedes Zuges zu kennen */
const detailQueue = []; let detailBusy = false;
function queueDetail(tr){ if ((tr.detail && !tr.stale) || tr.detailQueued) return; tr.detailQueued = true; detailQueue.push(tr.id); pumpDetails(); }
async function pumpDetails(){
  if (detailBusy) return; detailBusy = true;
  while (detailQueue.length){
    const id = detailQueue.shift(); const tr = trains.get(id); if (!tr || (tr.detail && !tr.stale)) continue;
    tr.stale = false;
    try{ const r = await fetch(`${API}/trip?tripId=${encodeURIComponent(id)}`); if (r.ok){ const d = await r.json(); const leg = d.legs && d.legs[0];
      if (leg){ tr.detail = leg; tr.headsign = leg.headsign; tr.sig = null; tr.pvg = PVG_RX.test(leg.agencyName||""); if (tr.pvg && typeof addLiveShape === "function") addLiveShape(tr); } } }catch(_){}
    await new Promise(r => setTimeout(r, 120));
  }
  detailBusy = false;
}

/* Polylinie mit Pixel-Versatz, damit parallele Linien gebündelt nebeneinander liegen (wie im Netzplan) */
L.OffsetLine = L.Polyline.extend({
  options:{offset:0},
  _projectLatlngs(latlngs, result, projectedBounds){
    L.Polyline.prototype._projectLatlngs.call(this, latlngs, result, projectedBounds);
    // Erst auf Bildschirmauflösung vereinfachen (Knicke unter ~1,5 px fallen weg), dann versetzen.
    // Sonst erzeugt der Versatz entlang winziger Gleisknicke beim Herauszoomen ein Zickzack.
    const o = this.options.offset, tol = this.options.simplifyPx || 1.5;
    for (let r = 0; r < result.length; r++){
      let pts = result[r].length > 2 ? L.LineUtil.simplify(result[r], tol) : result[r];
      result[r] = o ? offsetPts(pts, o) : pts;
    }
  }
});
function offsetPts(pts, d){
  const n = pts.length; if (n < 2) return pts;
  const out = new Array(n);
  for (let i = 0; i < n; i++){
    const a = pts[Math.max(0,i-1)], b = pts[i], c = pts[Math.min(n-1,i+1)];
    let n1x=0,n1y=0,n2x=0,n2y=0;
    if (i>0){ const dx=b.x-a.x, dy=b.y-a.y, l=Math.hypot(dx,dy)||1; n1x=-dy/l; n1y=dx/l; }
    if (i<n-1){ const dx=c.x-b.x, dy=c.y-b.y, l=Math.hypot(dx,dy)||1; n2x=-dy/l; n2y=dx/l; }
    if (i===0){n1x=n2x;n1y=n2y} if (i===n-1){n2x=n1x;n2y=n1y}
    let mx=n1x+n2x, my=n1y+n2y; const ml=Math.hypot(mx,my)||1; mx/=ml; my/=ml;
    const cos = mx*n1x+my*n1y; const k = d/Math.max(cos,.35);
    out[i] = L.point(b.x+mx*k, b.y+my*k);
  }
  return out;
}

/* ---------- Live-Daten ---------- */
const trains = new Map();   // tripId -> {ref, cat, mode, segs:[{dep,arr,sdep,from,to,pts,cum,len}], marker}
let lastOk = 0, fetching = false;

function decodePolyline(str, prec){
  const f = Math.pow(10,prec); const pts=[]; let i=0,lat=0,lng=0;
  while (i < str.length){
    for (let k=0;k<2;k++){
      let res=0, sh=0, b;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 31) << sh; sh += 5; } while (b >= 32 && i <= str.length);
      const d = (res & 1) ? ~(res >> 1) : (res >> 1);
      if (k===0) lat += d; else lng += d;
    }
    pts.push([lat/f, lng/f]);
  }
  return pts;
}
function decodeSeg(seg){
  let pts = decodePolyline(seg.polyline, 5);
  if (pts.length && Math.abs(pts[0][0]-seg.from.lat) > 1) pts = decodePolyline(seg.polyline, 6);
  if (pts.length < 2) pts = [[seg.from.lat,seg.from.lon],[seg.to.lat,seg.to.lon]];
  const cum=[0]; for (let i=1;i<pts.length;i++) cum.push(cum[i-1]+dist(pts[i-1],pts[i]));
  return {pts, cum, len: cum[cum.length-1]};
}
function dist(a,b){ const k=Math.cos(a[0]*Math.PI/180); const dx=(b[1]-a[1])*k, dy=b[0]-a[0]; return Math.sqrt(dx*dx+dy*dy); }

async function fetchLive(){
  if (fetching) return; fetching = true;
  const now = Date.now();
  const q = new URLSearchParams({min:`${BBOX.s},${BBOX.w}`, max:`${BBOX.n},${BBOX.e}`,
    startTime:new Date(now-3*60e3).toISOString(), endTime:new Date(now+8*60e3).toISOString(), zoom:"14"});
  try{
    const r = await fetch(`${API}/map/trips?${q}`);
    if (!r.ok) throw new Error("HTTP "+r.status);
    const data = await r.json();
    const fresh = new Map();
    for (const seg of data){
      if (!RAIL.has(seg.mode) || !seg.trips || !seg.trips.length) continue;
      const t = seg.trips[0]; const id = t.tripId;
      let tr = fresh.get(id);
      if (!tr){
        const ref = (t.routeShortName || "?").trim();
        const fv = false;
        tr = {id, ref, key:norm(ref), cat: fv ? "FV" : catOf(norm(ref)), mode:seg.mode, segs:[], rt:false};
        fresh.set(id, tr);
      }
      const g = decodeSeg(seg);
      tr.rt = tr.rt || seg.realTime;
      tr.segs.push({dep:Date.parse(seg.departure), arr:Date.parse(seg.arrival), sdep:Date.parse(seg.scheduledDeparture), sarr:Date.parse(seg.scheduledArrival),
        from:seg.from.name, to:seg.to.name, rt:seg.realTime, ...g});
    }
    for (const [id,tr] of fresh){
      tr.segs.sort((a,b)=>a.dep-b.dep);
      const old = trains.get(id);
      if (old){ tr.marker = old.marker; tr.heading = old.heading; tr.detail = old.detail; tr.headsign = old.headsign; tr.stale = old.stale; tr.detailQueued = old.detailQueued; tr.disp = old.disp; tr.pvg = old.pvg; }
      trains.set(id, tr);
    }
    for (const [id,tr] of trains) if (!fresh.has(id)){ if (tr.marker) trainLayer.removeLayer(tr.marker); trains.delete(id); }
    lastOk = Date.now();
    setStatus("live");
  }catch(e){
    setStatus("err", e.message);
  }finally{ fetching = false; }
}

/* Position eines Zuges zum Zeitpunkt t.
   - Abfahrt exakt zur (Echtzeit-)Abfahrtszeit.
   - Halt am Bahnhof: Ist im Plan kein Aufenthalt (Ankunft = Abfahrt, Minutenraster),
     rollt der Zug spätestens MIN_DWELL vor der Abfahrt ein und steht dann.
   - Fahrt mit Anfahren und Bremsen (trapezförmiges Geschwindigkeitsprofil). */
const MIN_DWELL = 20e3, ACC = 0.25;   // Busse halten kürzer
function motion(f){
  if (f <= 0) return 0; if (f >= 1) return 1;
  const v = 1/(1-ACC);
  if (f < ACC) return v*f*f/(2*ACC);
  if (f < 1-ACC) return v*(ACC/2 + (f-ACC));
  const g = 1-f; return 1 - v*g*g/(2*ACC);
}
function prepSegs(tr){
  if (tr._prep) return; tr._prep = true;
  const S = tr.segs;
  for (let i = 0; i < S.length; i++){
    const s = S[i], n = S[i+1];
    s.arrEff = s.arr;
    if (n && n.from === s.to && n.dep - s.arr < MIN_DWELL){
      // früher einrollen, aber höchstens die halbe Fahrzeit des Abschnitts opfern
      s.arrEff = Math.max(s.dep + (s.arr - s.dep)*0.5, n.dep - MIN_DWELL);
    }
    if (s.arrEff <= s.dep) s.arrEff = s.dep + 1;
  }
}
function positionOf(tr, t){
  const S = tr.segs; if (!S.length) return null;
  prepSegs(tr);
  let seg = null, frac = 0, dwell = false, idx = 0;
  if (t < S[0].dep){ seg = S[0]; frac = 0; dwell = true; }
  else {
    for (let i = 0; i < S.length; i++){
      const s = S[i];
      if (t >= s.dep && t <= s.arrEff){ seg = s; idx = i; frac = motion((t - s.dep)/(s.arrEff - s.dep)); break; }
      if (t > s.arrEff && (i === S.length-1 || t < S[i+1].dep)){ seg = s; idx = i; frac = 1; dwell = true; if (i === S.length-1 && t - s.arr > 4*60e3) return null; break; }
    }
  }
  if (!seg) return null;
  // Verspätung: beim Halt die Abfahrtsverspätung des nächsten Abschnitts, sonst die des aktuellen
  const nxt = dwell && frac === 1 ? S[idx+1] : null;
  const delay = Math.round((nxt ? nxt.dep - nxt.sdep : dwell && frac === 1 ? seg.arr - seg.sarr : seg.dep - seg.sdep)/60e3);
  const target = frac*seg.len, c = seg.cum, p = seg.pts;
  let j = 1; while (j < c.length-1 && c[j] < target) j++;
  const a = p[j-1], b = p[j], sl = c[j]-c[j-1], f = sl > 0 ? (target-c[j-1])/sl : 0;
  const lat = a[0]+(b[0]-a[0])*f, lon = a[1]+(b[1]-a[1])*f;
  const hd = Math.atan2((b[1]-a[1])*Math.cos(lat*Math.PI/180), b[0]-a[0])*180/Math.PI;
  const nextStop = dwell && frac === 1 ? (S[idx+1] || seg).to : seg.to;
  return {lat, lon, heading: hd, delay, dwell, at: dwell ? (frac === 0 ? seg.from : seg.to) : null, next: nextStop, from: seg.from, rt: seg.rt};
}

/* Gleitende Darstellung: Markierungen ~30-mal pro Sekunde versetzen.
   Neue Echtzeitdaten verschieben die Sollposition; der Unterschied klingt in ~1 s weich aus. */
let _lastFrame = 0;
function animateTrains(now){
  requestAnimationFrame(animateTrains);
  stepTrains(now);
}
// Absicherung: liefert der Browser keine Animations-Frames (Stromsparen, Hintergrund), weiter per Zeitgeber
setInterval(() => { const now = performance.now(); if (now - _lastFrame > 200) stepTrains(now); }, 100);
function stepTrains(now){
  if (now - _lastFrame < 33) return;
  const dt = _lastFrame ? Math.min(now - _lastFrame, 500) : 33; _lastFrame = now;
  const t = Date.now(), k = Math.exp(-dt/350);
  for (const tr of trains.values()){
    if (!tr.marker || !trainLayer.hasLayer(tr.marker)) continue;
    const p = positionOf(tr, t); if (!p) continue;
    if (!tr.offInit){
      tr.offInit = true; tr.off = [0,0];
      if (tr.disp){ const d0 = tr.disp[0]-p.lat, d1 = tr.disp[1]-p.lon; if (Math.hypot(d0,d1) < 0.03) tr.off = [d0,d1]; }
    }
    tr.off[0] *= k; tr.off[1] *= k;
    tr.disp = [p.lat + tr.off[0], p.lon + tr.off[1]];
    tr.marker.setLatLng(tr.disp);
  }
}