/* MDV Live – iPhone-Oberfläche. Nutzt core.js (Linien, Zugtypen, Live-Positionen). */
"use strict";

/* ---------- Einstellungen (pro Gerät) ---------- */
const DEF = {base:"dark", theme:"auto", opacity:60, brightness:100, fv:true, pics:true};
let S = Object.assign({}, DEF);
try{ Object.assign(S, JSON.parse(localStorage.getItem("pvg-app-settings")||"{}")); }catch(_){}
function saveS(){ try{ localStorage.setItem("pvg-app-settings", JSON.stringify(S)); }catch(_){} }
const mqDark = matchMedia("(prefers-color-scheme: dark)");
function effTheme(){ return S.theme === "auto" ? (mqDark.matches ? "dark" : "light") : S.theme; }

/* Doppelte Bahnhöfe zusammenfassen (z. B. zwei OSM-Punkte für Leipzig Hbf, weniger als ~300 m auseinander) */
(function(){
  const out = [];
  for (const st of D.stations.slice().sort((a,b) => b[3]-a[3])){
    const twin = out.find(o => dist([o[1],o[2]],[st[1],st[2]]) < 0.003 && o[0] === st[0]);
    if (!twin) out.push(st);
  }
  D.stations = out;
})();

/* ---------- Karte ---------- */
const map = L.map("map", {zoomControl:false, minZoom:8, maxZoom:17, zoomSnap:.25, tap:true, attributionControl:true, maxBoundsViscosity:1});
const HOME = [[50.98,11.58],[51.30,12.28]];   // Burgenlandkreis
// Karte auf das MDV-Gebiet begrenzen: nicht darüber hinaus schieben und nur so weit herauszoomen,
// dass der Bildschirm noch ganz vom Netz ausgefüllt ist.
const MDV_BOUNDS = L.latLngBounds([[BBOX.s, BBOX.w], [BBOX.n, BBOX.e]]);
map.setMaxBounds(MDV_BOUNDS);
function fitMinZoom(){
  const z = map.getBoundsZoom(MDV_BOUNDS, true);
  map.setMinZoom(Math.max(7, Math.ceil(z*4)/4));
}
fitMinZoom();
map.on("resize", fitMinZoom);
map.fitBounds(HOME, {padding:[10,10]});
map.createPane("netPane").style.zIndex = 410;
map.createPane("stPane").style.zIndex = 420;
map.createPane("trainPane").style.zIndex = 650;

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";
const BASES = {
  dark: L.tileLayer(ESRI+"Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",{maxZoom:17,maxNativeZoom:16,attribution:"© Esri, HERE, Garmin, © OSM"}),
  light: L.tileLayer(ESRI+"Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",{maxZoom:17,maxNativeZoom:16,attribution:"© Esri, HERE, Garmin, © OSM"}),
  satellite: L.tileLayer(ESRI+"World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:17,maxNativeZoom:18,attribution:"Satellit © Esri, Maxar, Earthstar Geographics"})
};
Object.values(BASES).forEach(layer => layer.on("tileerror", e => {
  const img = e.tile, n = (img._retry || 0) + 1; if (n > 4) return; img._retry = n;
  setTimeout(() => { img.src = img.src.split("#")[0] + "#r" + n; }, 800 * n);
}));
let base = null;
const trainLayer = L.layerGroup().addTo(map);
const netLayer = L.layerGroup().addTo(map);
const stLayer = L.layerGroup().addTo(map);
/* Fahrtroute des angetippten Zugs (über dem Netz, unter Bahnhöfen und Zügen) */
map.createPane("routePane").style.zIndex = 415;
const routeLayer = L.layerGroup().addTo(map);
let routeFor = null, routeTr = null;
function showRoute(tr){
  const leg = tr && tr.detail; if (!leg || routeFor === tr.id + leg.legGeometry?.length) return;
  routeLayer.clearLayers(); routeFor = tr.id + leg.legGeometry?.length; routeTr = tr;
  let pts = [];
  const g = leg.legGeometry;
  if (g && g.points){ pts = decodePolyline(g.points, g.precision || 7);
    if (pts.length && Math.abs(pts[0][0] - leg.from.lat) > 1) pts = decodePolyline(g.points, 6); }
  const stops = [leg.from, ...(leg.intermediateStops||[]), leg.to];
  if (pts.length < 2) pts = stops.map(s => [s.lat, s.lon]);
  const col = colorFor(tr.ref), z = map.getZoom(), w = widthFor(z) + 1.6, renderer = L.svg({pane:"routePane", padding:.6});
  routeLayer.addLayer(new L.OffsetLine(pts, {renderer, color:col, weight:w+9, opacity:.22, lineCap:"round", lineJoin:"round", interactive:false}));   // Leuchtrand
  routeLayer.addLayer(new L.OffsetLine(pts, {renderer, color:getCss("--bg"), weight:w+3, opacity:.95, lineCap:"round", lineJoin:"round", interactive:false}));
  routeLayer.addLayer(new L.OffsetLine(pts, {renderer, color:col, weight:w, opacity:1, lineCap:"round", lineJoin:"round", interactive:false}));
  for (const s of stops){
    if (s.lat == null) continue;
    routeLayer.addLayer(L.circleMarker([s.lat, s.lon], {pane:"routePane", renderer, radius: Math.max(3, w*.75), color:col, weight:2.5, fillColor:"#fff", fillOpacity:1, interactive:false}));
  }
}
/* Straßengenaue Linienwege der live fahrenden PVG-Busse sammeln (je Linie und Ziel einmal) */
const liveShapes = new Map(); let netTimer = null;
function addLiveShape(tr){
  const g = tr.detail && tr.detail.legGeometry; if (!g || !g.points) return;
  const k = tr.key + "|" + (tr.headsign || ""); if (liveShapes.has(k)) return;
  let pts = decodePolyline(g.points, g.precision || 7);
  if (pts.length && Math.abs(pts[0][0] - tr.detail.from.lat) > 1) pts = decodePolyline(g.points, 6);
  if (pts.length < 2) return;
  liveShapes.set(k, pts);
  clearTimeout(netTimer); netTimer = setTimeout(drawNetwork, 1500);
}
function clearRoute(){ routeLayer.clearLayers(); routeFor = null; routeTr = null; }
const getCss = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const segs = D.segs.map(([ids, flat]) => { const ll = []; for (let i=0;i<flat.length;i+=2) ll.push([flat[i],flat[i+1]]); return {ids, ll}; });
const state = {sel:null, follow:false, focus:null};

function applyView(){
  document.documentElement.dataset.theme = effTheme();
  document.querySelector('meta[name="theme-color"]').content = effTheme() === "light" ? "#eef1f4" : "#0d1117";
  if (base) map.removeLayer(base);
  base = BASES[S.base] || null;
  if (base){ base.setOpacity(S.opacity/100); base.addTo(map); }
  map.getPane("tilePane").style.filter = `brightness(${S.brightness/100})`;
  drawNetwork(); drawStations(); for (const t of trains.values()) t.sig = null;
}
mqDark.addEventListener && mqDark.addEventListener("change", () => { if (S.theme === "auto") applyView(); });

function widthFor(z){ return z<9?1.6 : z<10?2.2 : z<11?3 : z<12?3.6 : z<13?4.4 : 5.2; }
/* Farben des neutralen Schienennetzes, abgestimmt auf Kartenstil und Farbschema */
function railStyle(){
  if (S.base === "satellite") return {rail:"#f4f6f8", cas:"rgba(10,14,20,.75)", fv:"#d3d9e0"};
  const light = S.base === "light" || (S.base === "none" && effTheme() === "light");
  return light ? {rail:"#3c4554", cas:"#ffffff", fv:"#7a8494"} : {rail:"#b9c3d0", cas:"#0b0f14", fv:"#7d8794"};
}
function drawNetwork(){
  netLayer.clearLayers();
  const z = map.getZoom(), w = widthFor(z), renderer = L.svg({pane:"netPane", padding:.6});
  if (!state.focus){
    // Neutrales Netz: eine Linie pro Strecke, Hauptachsen (mehrere Linien) etwas breiter
    const rs = railStyle(), items = [];
    for (const s of segs){
      const ls = s.ids.map(i => D.lines[i]);
      const n = ls.filter(l => l.cat !== "FV").length, fvOnly = !n;
      if (fvOnly && !S.fv) continue;
      const rw = fvOnly ? Math.max(1.3, w*.6) : w*.62*(n >= 4 ? 1.6 : n >= 2 ? 1.3 : 1);
      items.push([s, rw, fvOnly]);
    }
    // Linienwege, die nicht in OSM stehen, aus den Fahrten der live fahrenden PVG-Busse
    for (const pts of liveShapes.values()) items.push([{ll:pts}, w*.62, false]);
    for (const [s, rw] of items) netLayer.addLayer(new L.OffsetLine(s.ll,{renderer,color:rs.cas,weight:rw+2.6,opacity:1,lineCap:"round",lineJoin:"round",interactive:false}));
    for (const [s, rw, fvOnly] of items) netLayer.addLayer(new L.OffsetLine(s.ll,{renderer,color:fvOnly ? rs.fv : rs.rail,weight:rw,opacity:1,lineCap:"round",lineJoin:"round",dashArray: fvOnly && z >= 10 ? `${rw*3} ${rw*2}` : null,interactive:false}));
    return;
  }
  // „Nur Linie …“: diese Linie farbig wie im Netzplan
  const gap = w*.95;
  for (const s of segs){
    const ls = s.ids.map(i => D.lines[i]);
    const reg = ls.filter(l => l.cat !== "FV" && (!state.focus || state.focus === l.key));
    const fv = S.fv && !state.focus && ls.some(l => l.cat === "FV");
    if (fv && !reg.length) netLayer.addLayer(new L.OffsetLine(s.ll,{renderer,color:"#7d8794",weight:Math.max(1.4,w*.7),opacity:.75,lineJoin:"round",interactive:false}));
    if (!reg.length) continue;
    netLayer.addLayer(new L.OffsetLine(s.ll,{renderer,color: fv ? "#7d8794" : getCss("--bg"),weight:reg.length*gap+(fv?4:2.5),opacity:.9,lineCap:"butt",lineJoin:"round",interactive:false}));
    reg.forEach((l,i) => netLayer.addLayer(new L.OffsetLine(s.ll,{renderer,offset:(i-(reg.length-1)/2)*gap,color:l.color,weight:w,lineCap:"butt",lineJoin:"round",interactive:false})));
  }
}
function drawStations(){
  stLayer.clearLayers();
  const z = map.getZoom(), minRank = z<11.5?2 : z<13?1 : 0, r = z<12?2.6 : z<14?3.2 : 4.2;
  for (const st of D.stations){
    const [name,lat,lon,rank] = st;
    if (rank < minRank) continue;
    const m = L.circleMarker([lat,lon],{pane:"stPane",radius: rank===2 ? r+1.6 : r, color:getCss("--fg"),weight:1.8,fillColor:getCss("--bg"),fillOpacity:1});
    const label = rank===2 || (rank===1 && z>=12.5) || z>=14.5;
    if (label) m.bindTooltip(cleanName(name),{permanent:true,direction:"right",offset:[6,0],className:"st-label"+(rank===2?" hbf":""),opacity:1,interactive:true});
    // größere unsichtbare Tippfläche
    const hit = L.circleMarker([lat,lon],{pane:"stPane",radius:14,stroke:false,fillOpacity:0});
    const open = () => openStation(st);
    hit.on("click", open); m.on("click", open);
    stLayer.addLayer(m); stLayer.addLayer(hit);
  }
}
function cleanName(n){ return n.replace(/\s*\(.*?\)\s*/g," ").trim(); }

/* ---------- Züge auf der Karte ---------- */
function delayColor(d, rt){ if (!rt) return getCss("--muted"); return d>=6 ? getCss("--bad") : d>=3 ? getCss("--warn") : getCss("--ok"); }
function iconFor(tr, pos){
  const col = colorFor(tr.ref), dc = delayColor(pos.delay,pos.rt), sel = state.sel === tr.id ? " sel" : state.sel ? " dim" : "";
  // kleine Verspätungsangabe über dem Symbol: +3 / −1 / +0 (nur mit Echtzeit)
  const dly = pos.rt ? `<span class="dly" style="color:${dc}">${pos.delay < 0 ? "−" + (-pos.delay) : "+" + pos.delay}</span>` : "";
  if (!S.pics || map.getZoom() < 11) return L.divIcon({className:"train"+sel, iconSize:[0,0], html:`<div class="pill mini" style="background:${col};border-color:${dc}">${dly}</div>`});
  const type = typeOf(tr), lv = liveryOf(tr, type), z = map.getZoom(), h = z >= 13 ? 20 : z >= 11 ? 16 : 13;
  return L.divIcon({className:"train"+sel, iconSize:[0,0],
    html:`<div class="veh${pos.heading>=0?"":" west"}" style="--dc:${dc}">${dly}<span class="pic">${trainSvg(type, lv, h)}</span><span class="tg" style="background:${col};color:${textOn(col)}">${esc(tr.ref)}</span></div>`});
}
function setStatus(kind){ document.getElementById("sdot").className = "dot " + kind; }

function tick(){
  const t = Date.now();
  for (const tr of trains.values()){
    const pos = positionOf(tr, t);
    const inBox = pos && pos.lat>BBOX.s && pos.lat<BBOX.n && pos.lon>BBOX.w && pos.lon<BBOX.e;
    if (!inBox){ if (tr.marker) trainLayer.removeLayer(tr.marker); tr.pos = null; continue; }
    tr.pos = pos; queueDetail(tr);
    const vis = tr.pvg === true && (!state.focus || tr.key === state.focus);
    const sig = [pos.heading>=0, pos.delay, pos.rt, map.getZoom(), state.sel===tr.id, !!state.sel, !!tr.detail, S.pics].join("|");
    if (!tr.marker){ tr.marker = L.marker([pos.lat,pos.lon],{pane:"trainPane",icon:iconFor(tr,pos),keyboard:false}); tr.marker.on("click", () => openTrain(tr.id)); tr.sig = sig; }
    else if (tr.sig !== sig){ tr.marker.setIcon(iconFor(tr,pos)); tr.sig = sig; }   // Position setzt animateTrains()
    if (vis && !trainLayer.hasLayer(tr.marker)) trainLayer.addLayer(tr.marker);
    if (!vis && trainLayer.hasLayer(tr.marker)) trainLayer.removeLayer(tr.marker);
  }
  const tm = new Date(t).toLocaleTimeString("de-DE");
  document.getElementById("clock").innerHTML = tm.slice(0,5) + `<small>:${tm.slice(6,8)}</small>`;
  if (view.kind === "train" && state.follow){ const tr = trains.get(state.sel); if (tr && tr.pos) panAbove([tr.pos.lat,tr.pos.lon]); }
  if (t - lastLive > 15000){ lastLive = t; refreshOpenView(); }
}
let lastLive = 0;

/* ---------- Blatt (Sheet) ---------- */
const sheet = document.getElementById("sheet"), body = document.getElementById("sheetBody");
let view = {kind:null};
function openSheet(html, kind, full){
  body.innerHTML = html; view.kind = kind;
  sheet.classList.add("open"); sheet.classList.toggle("full", !!full);
  body.scrollTop = 0;
}
function closeSheet(){
  sheet.classList.remove("open","full"); view = {kind:null};
  if (state.sel){ state.sel = null; state.follow = false; for (const t of trains.values()) t.sig = null; } clearRoute();
  setTab("map", true);
}
// Ziehen am Griff: hoch = voll, runter = halb bzw. schließen
(function(){
  const grab = document.getElementById("grab"); let y0 = null, h0 = 0;
  grab.addEventListener("touchstart", e => { y0 = e.touches[0].clientY; h0 = sheet.getBoundingClientRect().height; sheet.classList.add("dragging"); }, {passive:true});
  grab.addEventListener("touchmove", e => { if (y0 === null) return; const dy = e.touches[0].clientY - y0; sheet.style.height = Math.max(120, h0 - dy) + "px"; }, {passive:true});
  grab.addEventListener("touchend", e => {
    if (y0 === null) return; const dy = e.changedTouches[0].clientY - y0; y0 = null;
    sheet.classList.remove("dragging"); sheet.style.height = "";
    if (dy > 120 && !sheet.classList.contains("full")) closeSheet();
    else if (dy > 60) sheet.classList.remove("full");
    else if (dy < -40) sheet.classList.add("full");
  });
  grab.addEventListener("click", () => sheet.classList.toggle("full"));
})();
function sheetHeight(){ return sheet.classList.contains("open") ? sheet.getBoundingClientRect().height : 0; }
function panAbove(ll, zoom){
  const z = zoom || map.getZoom();
  const p = map.project(ll, z), off = sheetHeight()/2;
  map.setView(map.unproject(p.add([0, off]), z), z, {animate:true});
}

/* ---------- Tabs ---------- */
document.querySelectorAll("#tabs button").forEach(b => b.addEventListener("click", () => {
  const t = b.dataset.tab;
  if (t === "map") closeSheet(); else { setTab(t); renderTab(t); }
}));
function setTab(t, silent){ document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t)); }
function renderTab(t){
  if (t === "trains") showTrainList();
  if (t === "stations") showStationList();
  if (t === "settings") showSettings();
}
function refreshOpenView(){
  if (view.kind === "trains") updateTrainList();
  if (view.kind === "train" && state.sel) openTrain(state.sel, true);
  if (view.kind === "board") loadBoard(true);
}

/* ---------- Zugliste ---------- */
let trainQuery = "", trainCat = "all";
function showTrainList(){
  openSheet(`<div class="sh-h"><h2>Busse jetzt unterwegs</h2><button class="x" aria-label="Schließen" onclick="closeSheet()">×</button></div>
    <input class="search" id="tq" type="search" placeholder="Linie, Ziel oder Haltestelle" value="${esc(trainQuery)}" autocomplete="off">
    <div class="seg" id="tcat">${[["all","Alle"],["BUS","Linienbus"],["PLUS","PlusBus"]].map(([k,l]) => `<button data-k="${k}" aria-pressed="${trainCat===k}">${l}</button>`).join("")}</div>
    <ul class="list tl" id="tlist"></ul>`, "trains");
  document.getElementById("tq").addEventListener("input", e => { trainQuery = e.target.value; updateTrainList(); });
  document.querySelectorAll("#tcat button").forEach(b => b.onclick = () => { trainCat = b.dataset.k; document.querySelectorAll("#tcat button").forEach(x => x.setAttribute("aria-pressed", x === b)); updateTrainList(); });
  updateTrainList();
}
function updateTrainList(){
  const ul = document.getElementById("tlist"); if (!ul) return;
  const q = trainQuery.trim().toLowerCase(), qn = norm(trainQuery);
  const list = [...trains.values()].filter(tr => tr.pos && tr.pvg && (trainCat === "all" || tr.cat === trainCat))
    .filter(tr => !q || tr.key.includes(qn) || (tr.headsign||"").toLowerCase().includes(q) || tr.segs.some(s => s.from.toLowerCase().includes(q) || s.to.toLowerCase().includes(q)))
    .sort((a,b) => a.key.localeCompare(b.key, "de", {numeric:true}));
  if (!list.length){ ul.innerHTML = `<li class="empty" style="display:block">${trains.size ? "Keine passenden Busse." : "Live-Daten werden geladen…"}</li>`; return; }
  ul.innerHTML = list.map(tr => {
    const p = tr.pos, col = colorFor(tr.ref), type = typeOf(tr), lv = liveryOf(tr, type);
    const d = p.rt ? (p.delay > 0 ? `<span class="${p.delay>=6?"late":p.delay>=3?"slight":"ontime"}">+${p.delay}</span>` : `<span class="ontime">pünktl.</span>`) : `<span class="muted">Plan</span>`;
    const dest = shortStop(tr.headsign || tr.segs[tr.segs.length-1].to);
    return `<li data-id="${esc(tr.id)}"><span class="pic">${trainSvg(type, lv, 15)}</span>
      <div style="min-width:0"><div class="l1"><span class="badge" style="background:${col};color:${textOn(col)}">${esc(tr.ref)}</span><span class="dest">${esc(dest)}</span></div>
      <div class="nx">${p.dwell && p.at ? "Hält in " + esc(shortStop(p.at)) : "Nächster Halt " + esc(shortStop(p.next))}</div></div><span class="d">${d}</span></li>`;
  }).join("");
  ul.querySelectorAll("li[data-id]").forEach(li => li.onclick = () => openTrain(li.dataset.id));
}
function shortStop(s){ return String(s||"").replace(/\s*\(.*?\)/g,"").replace(/,\s*Bahnhof$/,"").trim(); }

/* ---------- Zug-Detail ---------- */
async function openTrain(id, refresh){
  const tr = trains.get(id);
  if (!refresh){
    state.sel = id; for (const t of trains.values()) t.sig = null;
    setTab("trains");
    if (tr && tr.pos) setTimeout(() => panAbove([tr.pos.lat,tr.pos.lon], Math.max(map.getZoom(), 11.5)), 60);
  }
  if (tr) renderTrain(tr, !refresh);
  try{
    const r = await fetch(`${API}/trip?tripId=${encodeURIComponent(id)}`); if (!r.ok) throw 0;
    const d = await r.json(); const leg = d.legs && d.legs[0]; if (!leg || state.sel !== id) return;
    const t2 = tr || {id, ref:(leg.routeShortName||leg.displayName||"?").trim(), key:norm(leg.routeShortName||""), cat:catOf(norm(leg.routeShortName||"")), segs:[], pos:null};
    t2.detail = leg; t2.headsign = leg.headsign; renderTrain(t2, false);
  }catch(_){ if (!tr && state.sel === id) openSheet(`<div class="empty">Fahrtverlauf nicht verfügbar.</div>`, "train"); }
}
function renderTrain(tr, scrollToNext){
  const keep = view.kind === "train" ? body.scrollTop : 0;
  if (state.sel === tr.id) showRoute(tr);
  const leg = tr.detail, col = colorFor(tr.ref), agency = leg ? (leg.agencyName||"") : "";
  const type = typeOf(tr), T = TYPES[type], lv = liveryOf(tr, type), ph = photoCache[photoKey(type, agency)];
  const p = tr.pos;
  const status = p ? (p.dwell && p.at ? `Hält in ${esc(shortStop(p.at))}` : `Unterwegs nach ${esc(shortStop(p.next))}`) : "Gerade nicht auf der Karte";
  const dl = p && p.rt ? (p.delay > 0 ? `<span class="${p.delay>=6?"late":"slight"}">+${p.delay} min</span>` : `<span class="ontime">pünktlich</span>`) : `<span class="muted">Fahrplanlage</span>`;
  const stops = leg ? [leg.from, ...(leg.intermediateStops||[]), leg.to] : [];
  const now = Date.now(); const nextIdx = stops.findIndex(s => Date.parse(s.departure || s.arrival) > now);
  const li = stops.map((s,i) => {
    const sched = Date.parse(s.scheduledArrival || s.scheduledDeparture), real = Date.parse(s.arrival || s.departure), dly = Math.round((real-sched)/60e3);
    const cls = i < nextIdx || nextIdx === -1 ? "past" : i === nextIdx ? "next" : "";
    const tc = !leg.realTime ? "" : dly>=6 ? "late" : dly>=3 ? "slight" : "ontime";
    const t = s.cancelled ? `<span class="cn">${fmt(sched)}</span>` : dly ? `<s>${fmt(sched)}</s><span class="${tc}">${fmt(real)}</span>` : `<span class="${tc}">${fmt(sched)}</span>`;
    return `<li class="${cls}"><span class="tk"></span><span class="stn" data-lat="${s.lat}" data-lon="${s.lon}" data-name="${esc(s.name)}">${esc(shortStop(s.name))}${s.track ? ` <span class="muted" style="font-size:12px">Gl. ${esc(s.track)}</span>` : ""}</span><span class="t">${t}</span></li>`;
  }).join("");
  // Reihenfolge: Kopf mit Ziel und Status → Fahrplan → Fahrzeug (Foto und Zugtyp) ganz unten
  openSheet(`<div class="sh-h"><span class="badge" style="background:${col};color:${textOn(col)};font-size:16px">${esc(tr.ref)}</span><h2>${leg ? "→ " + esc(shortStop(leg.headsign || leg.to.name)) : "Lade…"}</h2><button class="x" aria-label="Schließen" onclick="closeSheet()">×</button></div>
    <div class="sub">${status} · ${dl}</div>
    <div class="sub">${esc(agency)}${leg && leg.tripShortName && leg.tripShortName !== tr.ref ? " · Fahrt " + esc(leg.tripShortName) : ""}</div>
    <div class="btnrow"><button id="bf" aria-pressed="${state.follow}" ${p ? "" : "disabled"}>Bus folgen</button><button id="bl">Nur Linie ${esc(tr.ref)}</button></div>
    <div class="sec">Fahrplan</div>${leg ? `<ol class="stops">${li}</ol>` : `<div class="empty">Wird geladen…</div>`}
    <div class="sec">Fahrzeug</div>
    <div class="photo vphoto" id="photo">${ph ? photoHtml(ph, T) : trainSvg(type, lv, 50)}</div>
    <div class="vbox" style="margin-top:0"><div class="vn">${trainSvg(type, lv, 15)}<span>${esc(T.name)}</span></div><div class="vb">${esc([T.kind, T.br].filter(Boolean).join(" · "))}</div>
      <p>${esc(T.desc)}</p><div class="note">Schematische Darstellung, der eingesetzte Bustyp kann abweichen.${T.wiki ? ` <a href="https://de.wikipedia.org/wiki/${T.wiki}" target="_blank" rel="noopener">Wikipedia</a>` : ""}</div></div>`, "train");
  document.getElementById("bf").onclick = e => { state.follow = !state.follow; e.target.setAttribute("aria-pressed", state.follow); };
  document.getElementById("bl").onclick = () => { setFocus(state.focus === tr.key ? null : tr.key); };
  body.querySelectorAll(".stn").forEach(el => el.onclick = () => {
    const st = nearestStation(+el.dataset.lat, +el.dataset.lon) || [el.dataset.name, +el.dataset.lat, +el.dataset.lon, 1];
    openStation(st);
  });
  body.scrollTop = scrollToNext ? 0 : keep;
  if (!ph && T.q) loadPhoto(type, agency).then(p2 => { const el = document.getElementById("photo"); if (p2 && el && state.sel === tr.id) el.innerHTML = photoHtml(p2, T); });
}
function photoHtml(p, T){
  const cred = [p.artist, p.license].filter(Boolean).join(", ");
  return `<img src="${esc(p.src)}" alt="${esc(T.name)}" onerror="this.remove()"><div class="cred">Foto: <a href="${esc(p.page||"#")}" target="_blank" rel="noopener">${esc(cred || "Wikimedia Commons")}</a></div>`;
}
function setFocus(k){
  state.focus = k; drawNetwork(); for (const t of trains.values()) t.sig = null; tick();
  if (k){ const b = L.latLngBounds([]); D.segs.forEach((s,i) => { if (s[0].some(id => D.lines[id].key === k)) segs[i].ll.forEach(p => b.extend(p)); });
    if (b.isValid()) map.fitBounds(b, {paddingTopLeft:[20,60], paddingBottomRight:[20, sheetHeight()+20]}); }
  const bl = document.getElementById("bl"); if (bl) bl.textContent = k ? "Alle Linien zeigen" : "Nur Linie " + (trains.get(state.sel)||{}).ref;
}

/* ---------- Bahnhöfe ---------- */
let stQuery = "", myPos = null, meMarker = null;
function nearestStation(lat, lon){
  let best = null, bd = 1e9;
  for (const st of D.stations){ const d = dist([lat,lon],[st[1],st[2]]); if (d < bd){ bd = d; best = st; } }
  return bd < 0.01 ? best : null;
}
function kmTo(st){ if (!myPos) return null; const k = Math.cos(myPos[0]*Math.PI/180); return Math.hypot((st[2]-myPos[1])*k*111.3, (st[1]-myPos[0])*111.3); }
function showStationList(){
  openSheet(`<div class="sh-h"><h2>Haltestellen</h2><button class="x" aria-label="Schließen" onclick="closeSheet()">×</button></div>
    <input class="search" id="sq" type="search" placeholder="Haltestelle suchen, z. B. Zeitz, Busbahnhof" value="${esc(stQuery)}" autocomplete="off">
    <div class="btnrow" style="margin-top:0"><button id="near">${myPos ? "In meiner Nähe (aktualisieren)" : "Haltestellen in meiner Nähe"}</button></div>
    <ul class="list stl" id="slist"></ul>`, "stations");
  document.getElementById("sq").addEventListener("input", e => { stQuery = e.target.value; updateStationList(); });
  document.getElementById("near").onclick = () => locate(true);
  updateStationList();
}
function updateStationList(){
  const ul = document.getElementById("slist"); if (!ul) return;
  const q = stQuery.trim().toLowerCase();
  let list = D.stations.filter(st => !q || st[0].toLowerCase().includes(q));
  if (myPos && !q) list = list.slice().sort((a,b) => kmTo(a) - kmTo(b)).slice(0, 25);
  else list = list.slice().sort((a,b) => (b[3]-a[3]) || a[0].localeCompare(b[0], "de")).slice(0, 80);
  ul.innerHTML = list.map((st,i) => `<li data-i="${D.stations.indexOf(st)}"><span class="ring${st[3]===2?" hbf":""}"></span><span>${esc(cleanName(st[0]))}</span><span class="km">${myPos ? kmTo(st).toFixed(1).replace(".",",") + " km" : ""}</span></li>`).join("")
    || `<li class="empty" style="display:block">Keine Haltestelle gefunden.</li>`;
  ul.querySelectorAll("li[data-i]").forEach(li => li.onclick = () => { const st = D.stations[+li.dataset.i]; openStation(st); });
}

/* Abfahrtstafel */
let board = null;   // {st, stopId, mode:"dep"|"arr", rows}
async function openStation(st){
  setTab("stations");
  board = {st, stopId:null, mode: board && board.st === st ? board.mode : "dep", rows:null};
  if (state.sel){ state.sel = null; state.follow = false; for (const t of trains.values()) t.sig = null; } clearRoute();
  renderBoard();
  setTimeout(() => panAbove([st[1], st[2]], Math.max(map.getZoom(), 12.5)), 60);
  loadBoard();
}
async function loadBoard(silent){
  const b = board; if (!b) return;
  try{
    if (!b.stopId){
      const rg = await (await fetch(`${API}/reverse-geocode?place=${b.st[1]},${b.st[2]}&type=STOP`)).json();
      const railModes = ["BUS","COACH"];
      const hit = rg.find(x => x.type === "STOP" && (x.modes||[]).some(m => railModes.includes(m))) || rg.find(x => x.type === "STOP");
      if (!hit) throw new Error("kein Halt");
      b.stopId = hit.id;
    }
    const r = await fetch(`${API}/stoptimes?stopId=${encodeURIComponent(b.stopId)}&n=120${b.mode === "arr" ? "&arriveBy=true" : ""}`);
    const d = await r.json();
    if (board !== b) return;
    b.rows = (d.stopTimes || []).filter(s => RAIL.has(s.mode));
    b.err = null;
  }catch(e){ if (board === b) b.err = "Abfahrten konnten nicht geladen werden."; }
  if (board === b && view.kind === "board") renderBoard(true);
}
function renderBoard(keepScroll){
  const b = board, keep = keepScroll ? body.scrollTop : 0;
  const now = Date.now();
  const rows = (b.rows || []).filter(s => Date.parse(b.mode === "arr" ? (s.place.arrival||s.place.departure) : (s.place.departure||s.place.arrival)) > now - 60e3).slice(0, 40);
  const html = rows.map(s => {
    const P = s.place, sched = Date.parse(b.mode === "arr" ? (P.scheduledArrival||P.scheduledDeparture) : (P.scheduledDeparture||P.scheduledArrival));
    const real = Date.parse(b.mode === "arr" ? (P.arrival||P.departure) : (P.departure||P.arrival)), dly = Math.round((real-sched)/60e3);
    const canc = s.tripCancelled || P.cancelled, bus = false, ref = (s.routeShortName||s.displayName||"?").trim(), col = colorFor(ref);
    const other = b.mode === "arr" ? (s.tripFrom && s.tripFrom.name) : s.headsign;
    const tc = !s.realTime ? "" : dly>=6 ? "late" : dly>=3 ? "slight" : "ontime";
    const tags = [canc ? `<span class="tag bad">fällt aus</span>` : "", bus ? `<span class="tag warn">Bus statt Zug</span>` : "",
      !canc && s.realTime && dly > 0 ? `<span class="${tc}">+${dly} min</span>` : "", !s.realTime ? `<span class="muted">ohne Echtzeit</span>` : ""].join("");
    const chg = P.track && P.scheduledTrack && P.track !== P.scheduledTrack;
    return `<li class="${canc ? "canc" : ""}" data-trip="${esc(s.tripId)}">
      <div class="tm">${dly && !canc ? `<span class="${tc}">${fmt(real)}</span><s>${fmt(sched)}</s>` : fmt(sched)}</div>
      <div style="min-width:0"><div class="dir"><span class="badge" style="background:${col};color:${textOn(col)};margin-right:6px">${esc(ref)}</span>${b.mode === "arr" ? "von " : ""}${esc(shortStop(other||""))}</div>
        <div class="meta2">${tags}${s.agencyName ? `<span>${esc(s.agencyName.replace(/ AG| GmbH/g,""))}</span>` : ""}</div></div>
      <div class="gl${chg ? " chg" : ""}">${P.track || P.scheduledTrack ? `${esc(P.track || P.scheduledTrack)}<small>${chg ? "Steig geändert" : "Steig"}</small>` : ""}</div></li>`;
  }).join("");
  openSheet(`<div class="sh-h"><h2>${esc(cleanName(b.st[0]))}</h2><button class="x" aria-label="Schließen" onclick="closeSheet()">×</button></div>
    <div class="seg" id="bmode"><button data-m="dep" aria-pressed="${b.mode==="dep"}">Abfahrten</button><button data-m="arr" aria-pressed="${b.mode==="arr"}">Ankünfte</button></div>
    ${b.err ? `<div class="empty">${b.err}</div>` : b.rows === null ? `<div class="empty">Lade Abfahrtstafel…</div>` : rows.length ? `<ul class="list board">${html}</ul><div class="about">Live von Transitous · aktualisiert sich alle 15 Sekunden</div>` : `<div class="empty">In nächster Zeit keine Busse.</div>`}`, "board");
  document.querySelectorAll("#bmode button").forEach(x => x.onclick = () => { if (b.mode === x.dataset.m) return; b.mode = x.dataset.m; b.rows = null; renderBoard(); loadBoard(); });
  body.querySelectorAll("li[data-trip]").forEach(li => li.onclick = () => openTrain(li.dataset.trip));
  body.scrollTop = keep;
}

/* ---------- Ansicht / Einstellungen ---------- */
function showSettings(){
  const segB = (id, cur, opts) => `<div class="seg" id="${id}">${opts.map(([k,l]) => `<button data-k="${k}" aria-pressed="${cur===k}">${l}</button>`).join("")}</div>`;
  openSheet(`<div class="sh-h"><h2>Ansicht</h2><button class="x" aria-label="Schließen" onclick="closeSheet()">×</button></div>
    <div class="sec" style="margin-top:4px">Hintergrundkarte</div>${segB("sBase", S.base, [["dark","Dunkel"],["light","Hell"],["satellite","Satellit"],["none","Keine"]])}
    <div class="sec">Farbschema</div>${segB("sTheme", S.theme, [["auto","Automatisch"],["dark","Dunkel"],["light","Hell"]])}
    <div class="opt"><label for="sOp">Deckkraft der Karte</label><input id="sOp" type="range" min="0" max="100" step="5" value="${S.opacity}"><span class="val" id="vOp">${S.opacity} %</span></div>
    <div class="opt"><label for="sBr">Helligkeit der Karte</label><input id="sBr" type="range" min="20" max="200" step="5" value="${S.brightness}"><span class="val" id="vBr">${S.brightness} %</span></div>
    
    <div class="opt"><label for="sPic">Busbilder auf der Karte</label><input id="sPic" class="sw" type="checkbox" ${S.pics ? "checked" : ""}></div>
    <div class="btnrow"><button id="sReset">Standard wiederherstellen</button></div>
    <div class="about">Live-Positionen und Abfahrten: <a href="https://transitous.org" target="_blank" rel="noopener">Transitous</a> (DELFI-Fahrplan mit Echtzeit), zwischen den Halten berechnet. Linienwege und Haltestellen: © OpenStreetMap-Mitwirkende. Kein offizielles Angebot der PVG Burgenlandkreis.<br><br>Tipp: In Safari auf „Teilen“ → „Zum Home-Bildschirm“ tippen, dann startet PVG Live wie eine App.</div>`, "settings");
  const bindSeg = (id, key) => document.querySelectorAll(`#${id} button`).forEach(x => x.onclick = () => { S[key] = x.dataset.k; saveS(); document.querySelectorAll(`#${id} button`).forEach(y => y.setAttribute("aria-pressed", y === x)); applyView(); });
  bindSeg("sBase","base"); bindSeg("sTheme","theme");
  const op = document.getElementById("sOp"), br = document.getElementById("sBr");
  op.oninput = () => { S.opacity = +op.value; document.getElementById("vOp").textContent = S.opacity + " %"; if (base) base.setOpacity(S.opacity/100); saveS(); };
  br.oninput = () => { S.brightness = +br.value; document.getElementById("vBr").textContent = S.brightness + " %"; map.getPane("tilePane").style.filter = `brightness(${S.brightness/100})`; saveS(); };
  
  document.getElementById("sPic").onchange = e => { S.pics = e.target.checked; saveS(); tick(); };
  document.getElementById("sReset").onclick = () => { S = Object.assign({}, DEF); saveS(); applyView(); showSettings(); };
}

/* ---------- Standort ---------- */
function locate(fromList){
  if (!navigator.geolocation){ return; }
  navigator.geolocation.getCurrentPosition(p => {
    myPos = [p.coords.latitude, p.coords.longitude];
    if (!meMarker) meMarker = L.marker(myPos, {icon:L.divIcon({className:"", html:'<div class="me"></div>', iconSize:[16,16], iconAnchor:[8,8]}), pane:"trainPane", interactive:false}).addTo(map);
    else meMarker.setLatLng(myPos);
    if (fromList) showStationList(); else panAbove(myPos, 13);
  }, () => {
    if (fromList){ const b = document.getElementById("near"); if (b) b.textContent = "Standort nicht freigegeben (Einstellungen → Safari → Standort)"; }
  }, {enableHighAccuracy:true, timeout:10000, maximumAge:60000});
}
document.getElementById("fab-loc").onclick = () => locate(false);
document.getElementById("fab-home").onclick = () => { setFocus(null); map.fitBounds(HOME, {padding:[10,10]}); };

/* ---------- Helfer & Start ---------- */
function fmt(ms){ return new Date(ms).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}); }
function esc(s){ return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
map.on("zoomend", () => { drawNetwork(); drawStations(); if (routeTr){ const rt = routeTr; routeFor = null; showRoute(rt); } for (const t of trains.values()) t.sig = null; tick(); });
map.on("dragstart", () => { if (state.follow){ state.follow = false; const b = document.getElementById("bf"); if (b) b.setAttribute("aria-pressed","false"); } });

applyView();
fetchLive().then(tick);
setInterval(tick, 1000);
requestAnimationFrame(animateTrains);
setInterval(fetchLive, 20000);
document.addEventListener("visibilitychange", () => { if (!document.hidden){ fetchLive().then(tick); if (view.kind === "board") loadBoard(true); } });
