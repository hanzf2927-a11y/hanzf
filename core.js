/* MDV Live – gemeinsamer Kern (aus der Desktop-Version übernommen) */
"use strict";
const D = window.MDV_DATA;
const API = "https://api.transitous.org/api/v1";
const BBOX = {s:50.85, w:11.35, n:51.80, e:13.20};
const RAIL = new Set(["HIGHSPEED_RAIL","LONG_DISTANCE","NIGHT_RAIL","REGIONAL_FAST_RAIL","REGIONAL_RAIL","SUBURBAN","METRO","RAIL"]);
const CATS = [{k:"S",t:"S-Bahn"},{k:"RE",t:"RE"},{k:"RB",t:"RB"},{k:"FV",t:"Fern"}];
const CAT_FALLBACK = {S:"#6e7681",RE:"#c9d1d9",RB:"#8b98a9",FV:"#f0f6fc"};
const PALETTE = ["#e8590c","#2f9e44","#1c7ed6","#ae3ec9","#f08c00","#0c8599","#d6336c","#5c940d","#4263eb","#c2255c","#099268","#e67700","#7048e8","#a61e4d","#1098ad","#74b816","#f76707","#3b5bdb","#9c36b5","#0b7285","#d9480f","#2b8a3e","#364fc7","#862e9c","#e64980","#40c057","#fab005","#15aabf","#be4bdb","#fd7e14"];

/* ---------- Linien & Farben ---------- */
const norm = s => (s||"").replace(/\s+/g,"").toUpperCase();
const catOf = r => /^S\d/.test(r)?"S":/^RE/.test(r)?"RE":/^RB/.test(r)?"RB":/^(ICE|IC|EC|FLX|TGV|NJ|EN|ECE|RJ)/.test(r)?"FV":"RB";
let pi = 0;
D.lines.forEach(l => {
  if (l.cat === "FV") l.color = "#9aa5b4";
  else if (!l.color || !/^#[0-9a-f]{3,6}$/i.test(l.color)) l.color = PALETTE[pi++ % PALETTE.length];
  l.key = norm(l.ref);
});
const lineByKey = new Map(D.lines.map(l => [l.key, l]));
function colorFor(ref){
  const k = norm(ref); const l = lineByKey.get(k);
  if (l) return l.color;
  return CAT_FALLBACK[catOf(k)];
}
function textOn(hex){
  const h = hex.replace("#",""); const f = h.length===3 ? h.split("").map(c=>c+c).join("") : h;
  const r=parseInt(f.slice(0,2),16), g=parseInt(f.slice(2,4),16), b=parseInt(f.slice(4,6),16);
  return (0.299*r+0.587*g+0.114*b) > 165 ? "#111" : "#fff";
}

/* ---------- Fahrzeugtypen ----------
   Zuordnung über Betreiber (aus dem Fahrtverlauf) und Linie. Es ist der typische Fahrzeugeinsatz,
   keine Wagenreihung des einzelnen Zuges. */
const TYPES = {
  talent2: {name:"Bombardier Talent 2", br:"Baureihe 1442 / 442", kind:"Elektrotriebzug", q:"S-Bahn Mitteldeutschland. Talent 2, Frontansicht.jpg", qab:"J41 149 Bf Halle-Südstadt, 9442 609, 1442 210.jpg", wiki:"Bombardier_Talent_2",
    desc:"Niederflur-Elektrotriebzug mit der markanten runden Front. Rückgrat der S-Bahn Mitteldeutschland und vieler Regionallinien.",
    d:{cars:[24,20,24], nose:"talent", panto:true}},
  lint41: {name:"Alstom Coradia LINT 41", br:"Baureihe 648", kind:"Dieseltriebzug", q:"L09 169 Bf Erfurt Hbf, 0648 211.jpg", wiki:"Alstom_Coradia_LINT",
    desc:"Zweiteiliger Dieseltriebzug mit Jakobs-Drehgestell. Typisch für nicht elektrifizierte Strecken in Sachsen-Anhalt und Thüringen.",
    d:{cars:[22,22], nose:"slope", diesel:true}},
  rs1: {name:"Stadler Regio-Shuttle RS 1", br:"Baureihe 650", kind:"Dieseltriebwagen", q:"Stadler Regio-Shuttle RS1 (Erfurter Bahn).JPG", wiki:"Stadler_Regio-Shuttle_RS1",
    desc:"Einteiliger Niederflur-Dieseltriebwagen für Nebenbahnen, oft in Doppel- oder Dreifachtraktion.",
    d:{cars:[26], nose:"flat", diesel:true}},
  desiro: {name:"Siemens Desiro Classic", br:"Baureihe 642", kind:"Dieseltriebzug", q:"Chemnitz Erzgebirgsbahn Siemens Desiro Classic.jpg", wiki:"Siemens_Desiro_Classic",
    desc:"Zweiteiliger Dieseltriebzug mit Mittelteil in Niederflur. In Sachsen auf vielen Dieselstrecken unterwegs.",
    d:{cars:[22,22], nose:"slope", diesel:true}},
  vt612: {name:"Bombardier RegioSwinger", br:"Baureihe 612", kind:"Neigetechnik-Dieseltriebzug", q:"612 028 Gera Hbf.jpg", wiki:"DB-Baureihe_612",
    desc:"Dieseltriebzug mit Neigetechnik für kurvenreiche Strecken, z. B. RE 1 und RE 3 über Gera.",
    d:{cars:[25,25], nose:"blunt", diesel:true, high:true}},
  coradia: {name:"Alstom Coradia Continental", br:"Baureihe 1440", kind:"Elektrotriebzug", q:"Chemnitz Hbf MRB Alstom Coradia Continental 1440 828.jpg", wiki:"Alstom_Coradia_Continental",
    desc:"Elektrischer Niederflur-Triebzug, bei der Mitteldeutschen Regiobahn im Elektronetz Mittelsachsen.",
    d:{cars:[22,20,22], nose:"slope", panto:true}},
  dosto: {name:"Doppelstockzug mit E-Lok", br:"Baureihe 146 + DB-Doppelstockwagen", kind:"Wendezug", q:"L03 199 Bf Leipzig Hbf, 146 225.jpg", wiki:"Doppelstockwagen_(Deutsche_Bahn)",
    desc:"Lok mit doppelstöckigen Wagen und Steuerwagen. Viel Platz auf stark genutzten RE-Linien wie RE 13, RE 30 und RE 50.",
    d:{cars:[17,24,24,24], nose:"dostocab", loco:true, dd:true, panto:true}},
  ice: {name:"ICE 4 / ICE 3", br:"Baureihe 412 / 403 / 407 / 408", kind:"Hochgeschwindigkeitszug", q:"Erfurt Hbf ICE.jpg", wiki:"ICE_4",
    desc:"Fernverkehr der DB. Durch das MDV-Gebiet laufen vor allem die Linien über Leipzig, Halle und die Schnellfahrstrecke nach Erfurt.",
    d:{cars:[28,24,24,24], nose:"ice", panto:true}},
  ic: {name:"Intercity", br:"IC 2 (Doppelstock) oder IC 1", kind:"Lokbespannter Fernzug", q:"Intercity 2 2019 -im Leipzig Hbf- by-RaBoe 007.jpg", wiki:"Intercity_2_(Deutsche_Bahn)",
    desc:"Intercity-Züge der DB, je nach Linie mit doppelstöckigen IC-2-Wagen oder klassischen IC-Wagen und Lok.",
    d:{cars:[17,24,24,24], nose:"loco", loco:true, dd:true, panto:true}},
  flx: {name:"Flixtrain", br:"Lok + Reisezugwagen", kind:"Lokbespannter Fernzug", q:"I20 668 Bf Leipzig Hbf, 193 604.jpg", wiki:"Flixtrain",
    desc:"Privater Fernverkehr mit Lok und klassischen Reisezugwagen in Grün.",
    d:{cars:[17,24,24,24], nose:"loco", loco:true, panto:true}},
  citylink: {name:"Stadler Citylink", br:"Chemnitzer Modell", kind:"Tram-Train", q:"Citylink Chemnitz 2022.jpg", wiki:"Stadler_Citylink",
    desc:"Zweisystem-Stadtbahn: fährt in Chemnitz als Straßenbahn und im Umland auf Eisenbahngleisen.",
    d:{cars:[18,16,18], nose:"tram", panto:true}},
  generic: {name:"Regionalzug", br:"", kind:"Fahrzeug unbekannt", q:"", wiki:"",
    desc:"Für diese Fahrt ist kein typisches Fahrzeug hinterlegt.",
    d:{cars:[22,22], nose:"slope"}}
};
const LINE_TYPE = {
  S1:"talent2",S2:"talent2",S3:"talent2",S4:"talent2",S5:"talent2",S5X:"talent2",S6:"talent2",S7:"talent2",S8:"talent2",S9:"talent2",S10:"talent2",S11:"lint41",S30:"talent2",
  RB20:"talent2",RB25:"talent2",RE15:"talent2",RE16:"talent2",RE8:"talent2",RE9:"talent2",RE17:"talent2",
  RB13:"rs1",RB21:"lint41",RB22:"lint41",RE12:"lint41",RB76:"lint41",RB4:"rs1",RB28:"rs1",RB27:"rs1",
  RB110:"desiro",RB45:"desiro",RE6:"desiro",RB80:"desiro",RB81:"desiro",RB37:"desiro",RB30:"coradia",
  RB113:"talent2",RB41:"talent2",RB47:"lint41",RB50:"lint41",RB51:"lint41",RB77:"lint41",RE24:"lint41",RE4:"lint41",RB44:"lint41",
  RE1:"vt612",RE3:"vt612",RE10:"talent2",RE11:"talent2",
  RE13:"dosto",RE30:"dosto",RE50:"dosto"
};
const LIVERY = [
  {m:/flix/i, body:"#73d700", band:"#1b2a12", stripe:"#ff5a00"},
  {m:/abellio/i, body:"#d9dde1", band:"#20262e", stripe:"#e2001a"},
  {m:/erfurter bahn/i, body:"#f2f2f2", band:"#20262e", stripe:"#58a83a"},
  {m:/mitteldeutsche regiobahn|transdev/i, body:"#f2f2f2", band:"#20262e", stripe:"#3f9b5a"},
  {m:/chemnitzer|city-bahn/i, body:"#f2f2f2", band:"#20262e", stripe:"#d52b1e"},
  {m:/fernverkehr/i, body:"#f4f4f4", band:"#20262e", stripe:"#ec0016"},
  {m:/DB|Deutsche Bahn|Erzgebirgsbahn/i, body:"#ec0016", band:"#2a1214", stripe:"#ffffff"}
];
function typeOf(tr){
  const a = (tr.detail && tr.detail.agencyName) || tr.agency || "";
  const k = tr.key;
  if (/^FLX/.test(k) || /flix/i.test(a)) return "flx";
  if (/^ICE/.test(k)) return "ice";
  if (/^(IC|EC)/.test(k)) return "ic";
  if (/^C\d/.test(k) || /chemnitzer/i.test(a)) return "citylink";
  if (/mitteldeutsche regiobahn|transdev/i.test(a) && (k==="RE3"||k==="RB30")) return "coradia";
  if (/abellio/i.test(a)) return "talent2";
  if (/erfurter bahn/i.test(a)) return LINE_TYPE[k]==="rs1" ? "rs1" : "lint41";
  if (LINE_TYPE[k]) return LINE_TYPE[k];
  if (tr.cat === "S") return "talent2";
  return "generic";
}
function liveryOf(tr, type){
  const a = (tr.detail && tr.detail.agencyName) || "";
  if (type === "ice" || type === "ic") return LIVERY[5];
  if (type === "flx") return LIVERY[0];
  if (type === "talent2" && tr.cat === "S" && !/abellio/i.test(a)) return {body:"#eef0f2", band:"#20262e", stripe:"#ec0016"}; // S-Bahn Mitteldeutschland
  for (const l of LIVERY) if (a && l.m.test(a)) return l;
  return LIVERY[6];
}

/* Seitenansicht als SVG, Front zeigt nach rechts */
function trainSvg(type, lv, h){
  const d = TYPES[type].d, H = 20, gap = 1.2;
  const total = d.cars.reduce((s,c)=>s+c,0) + gap*(d.cars.length-1) + 2;
  const top = d.dd ? 2 : d.high ? 4 : 5, bot = 16;
  let x = 1, out = "";
  d.cars.forEach((len, i) => {
    const last = i === d.cars.length-1, first = i === 0;
    const isLoco = d.loco && i === 0;
    const ctop = isLoco ? 4 : top;
    let path;
    const L = x, R = x+len;
    if (last && d.nose === "talent") path = `M${L},${ctop+1} Q${L},${ctop} ${L+1},${ctop} H${R-7} Q${R+0.5},${ctop} ${R},${bot-3} V${bot} H${L} Z`;
    else if (last && d.nose === "ice") path = `M${L},${ctop+1} Q${L},${ctop} ${L+1},${ctop} H${R-12} Q${R-2},${ctop} ${R+1},${bot-1.5} L${R+1},${bot} H${L} Z`;
    else if (last && (d.nose === "slope" || d.nose === "tram")) path = `M${L},${ctop+1} Q${L},${ctop} ${L+1},${ctop} H${R-4} L${R},${ctop+5} V${bot} H${L} Z`;
    else if (last && d.nose === "dostocab") path = `M${L},${ctop+1} Q${L},${ctop} ${L+1},${ctop} H${R-5} L${R},${ctop+7} V${bot} H${L} Z`;
    else if (last && d.nose === "blunt") path = `M${L},${ctop+1} Q${L},${ctop} ${L+1},${ctop} H${R-3} Q${R},${ctop} ${R},${ctop+4} V${bot} H${L} Z`;
    else path = `M${L},${ctop+1} Q${L},${ctop} ${L+1},${ctop} H${R-1} Q${R},${ctop} ${R},${ctop+1} V${bot} H${L} Z`;
    if (first && !isLoco && d.cars.length > 1 && d.nose !== "ice" && d.nose !== "dostocab") {
      // hinterer Kopf spiegelbildlich etwas abgerundet
      path = path.replace(`M${L},${ctop+1} Q${L},${ctop} ${L+1},${ctop}`, `M${L},${ctop+4} Q${L},${ctop} ${L+4},${ctop}`);
    }
    out += `<path d="${path}" fill="${lv.body}" stroke="rgba(0,0,0,.55)" stroke-width=".6"/>`;
    if (isLoco){
      out += `<rect x="${L+1.5}" y="${ctop+2}" width="3" height="3" rx=".5" fill="${lv.band}"/><rect x="${R-4.5}" y="${ctop+2}" width="3" height="3" rx=".5" fill="${lv.band}"/>`;
      out += `<rect x="${L}" y="${bot-4}" width="${len}" height="1.6" fill="${lv.stripe}"/>`;
    } else if (d.dd){
      out += `<rect x="${L+2}" y="${ctop+2.3}" width="${len-4}" height="2.6" rx=".6" fill="${lv.band}"/><rect x="${L+2}" y="${ctop+7.4}" width="${len-4}" height="2.6" rx=".6" fill="${lv.band}"/>`;
      out += `<rect x="${L}" y="${bot-2.6}" width="${len}" height="1.2" fill="${lv.stripe}"/>`;
    } else {
      const wy = ctop+2.6, wh = 3.6;
      const wl = L + (first && d.cars.length>1 ? 3 : 2), wr = R - (last ? (d.nose==="ice"?11:d.nose==="talent"?6:4) : 2);
      out += `<rect x="${wl}" y="${wy}" width="${Math.max(2,wr-wl)}" height="${wh}" rx=".8" fill="${lv.band}"/>`;
      out += `<rect x="${L}" y="${bot-3}" width="${len - (last && d.nose==="ice" ? 1 : 0)}" height="1.4" fill="${lv.stripe}"/>`;
      const doorX = L + len/2 - 1.2;
      if (type !== "ice") out += `<rect x="${doorX}" y="${ctop+2}" width="2.4" height="${bot-ctop-2.6}" fill="rgba(0,0,0,.28)"/>`;
    }
    if (last && d.nose !== "ice") out += `<circle cx="${R-1.2}" cy="${bot-1.2}" r=".7" fill="#fff6c8"/>`;
    // Drehgestelle
    out += `<rect x="${L+2}" y="${bot}" width="4" height="2" rx="1" fill="#1a1d22"/><rect x="${R-6}" y="${bot}" width="4" height="2" rx="1" fill="#1a1d22"/>`;
    if (d.panto && (isLoco || (!d.loco && i === Math.floor(d.cars.length/2))))
      out += `<path d="M${L+len/2-3},${ctop} L${L+len/2},${ctop-3} L${L+len/2+3},${ctop}" fill="none" stroke="#9aa3ad" stroke-width=".7"/><path d="M${L+len/2-2},${ctop-3} H${L+len/2+2}" stroke="#9aa3ad" stroke-width=".7"/>`;
    if (d.diesel && i === 0) out += `<rect x="${L+len/2-2}" y="${ctop-1}" width="4" height="1" fill="#59606a"/>`;
    x += len + gap;
  });
  const w = Math.round(total * h / H);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -3 ${total+1} ${H+3}" width="${w}" height="${Math.round(h*(H+3)/H)}" aria-hidden="true">${out}</svg>`;
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
      if (leg){ tr.detail = leg; tr.headsign = leg.headsign; tr.sig = null; } } }catch(_){}
    await new Promise(r => setTimeout(r, 350));
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
        const fv = seg.mode==="HIGHSPEED_RAIL"||seg.mode==="LONG_DISTANCE"||seg.mode==="NIGHT_RAIL";
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
      if (old){ tr.marker = old.marker; tr.heading = old.heading; tr.detail = old.detail; tr.headsign = old.headsign; tr.stale = old.stale; tr.detailQueued = old.detailQueued; tr.disp = old.disp; }
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
const MIN_DWELL = 45e3, ACC = 0.2;
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
