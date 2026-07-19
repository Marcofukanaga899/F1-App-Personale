// ============================================================
// PADDOCK — F1 Dashboard
// Dati in tempo reale da: jolpica-f1 (calendario/classifiche) e Open-Meteo (meteo)
// ============================================================

const API_BASE = 'https://api.jolpi.ca/ergast/f1';

const TEAM_CODES = {
  'Mercedes':'MER', 'Ferrari':'FER', 'McLaren':'MCL', 'Red Bull':'RBR',
  'Alpine':'ALP', 'Racing Bulls':'RCB', 'Haas':'HAA', 'Williams':'WIL',
  'Audi':'AUD', 'Aston Martin':'AST', 'Cadillac':'CAD'
};
const TEAM_COLORS = {
  'Mercedes':      '#27F4D2',
  'Ferrari':       '#E80020',
  'Red Bull':      '#3671C6',
  'McLaren':       '#FF8000',
  'Racing Bulls':  '#6692FF',
  'Aston Martin':  '#00665E',
  'Alpine':        '#FF87BC',
  'Williams':      '#64C4FF',
  'Audi':          '#C8CED4',
  'Haas':          '#8B1A1A',
  'Cadillac':      '#000000',
};

// Mappa circuitId (jolpica) -> id file tracciato in circuits-data.js
const CIRCUIT_ID_MAP = {
  albert_park:'au-1953', shanghai:'cn-2004', suzuka:'jp-1962', bahrain:'bh-2002',
  jeddah:'sa-2021', miami:'us-2022', villeneuve:'ca-1978', monaco:'mc-1929',
  catalunya:'es-1991', red_bull_ring:'at-1969', silverstone:'gb-1948', spa:'be-1925',
  hungaroring:'hu-1986', zandvoort:'nl-1948', monza:'it-1922', baku:'az-2016',
  marina_bay:'sg-2008', americas:'us-2012', rodriguez:'mx-1962', interlagos:'br-1940',
  las_vegas:'us-2023', losail:'qa-2004', yas_marina:'ae-2009', madring:'es-2026'
};

const CONSTRUCTOR_ID_TO_TEAM = {
  'mercedes':'Mercedes', 'ferrari':'Ferrari', 'mclaren':'McLaren',
  'red_bull':'Red Bull', 'rb':'Racing Bulls', 'alphatauri':'Racing Bulls',
  'alpine':'Alpine', 'aston_martin':'Aston Martin', 'williams':'Williams',
  'sauber':'Audi', 'audi':'Audi', 'haas':'Haas', 'cadillac':'Cadillac'
};
function normalizeTeamName(constructorId, fallbackName){
  return CONSTRUCTOR_ID_TO_TEAM[(constructorId || '').toLowerCase()] || fallbackName || 'Sconosciuta';
}

function contrastText(hex){
  const c = (hex || '#CCCCCC').replace('#','');
  const r = parseInt(c.substring(0,2),16), g = parseInt(c.substring(2,4),16), b = parseInt(c.substring(4,6),16);
  const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
  return lum > 0.6 ? '#15151E' : '#FFFFFF';
}

async function fetchJSON(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error('HTTP ' + res.status + ' su ' + url);
  return res.json();
}

// ---------- FAVORITES (localStorage) ----------
function getFavs(key){ try{ return JSON.parse(localStorage.getItem(key) || '[]'); }catch(e){ return []; } }
function setFavs(key, arr){ try{ localStorage.setItem(key, JSON.stringify(arr)); }catch(e){} }
function toggleFav(key, name){
  const favs = getFavs(key);
  const i = favs.indexOf(name);
  if(i>=0) favs.splice(i,1); else favs.push(name);
  setFavs(key, favs);
}

// ============================================================
// STATO GLOBALE
// ============================================================
let driversData = [];
let teamsData = [];
let seasonRaces = [];       // tutti i GP della stagione (calendario completo)
let headerSessions = [];    // sessioni del PROSSIMO gp reale, guidano il countdown in header
let nextRoundGlobal = null; // round del prossimo gp reale
let displayedRound = null;  // round attualmente mostrato nel pannello "Circuito"
let countdownTimer = null;

// ============================================================
// CLASSIFICHE
// ============================================================
async function loadStandings(){
  try{
    const [dRes, cRes] = await Promise.all([
      fetchJSON(`${API_BASE}/current/driverstandings.json`),
      fetchJSON(`${API_BASE}/current/constructorstandings.json`)
    ]);
    const dList = dRes.MRData.StandingsTable.StandingsLists[0]?.DriverStandings || [];
    const cList = cRes.MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings || [];
    const leaderPts = dList.length ? Number(dList[0].points) : 0;
    const leaderPtsC = cList.length ? Number(cList[0].points) : 0;

    driversData = dList.map(ds => {
      const team = normalizeTeamName(ds.Constructors[0]?.constructorId, ds.Constructors[0]?.name);
      return {
        pos: Number(ds.position),
        num: ds.Driver.permanentNumber || '—',
        name: (ds.Driver.givenName?.[0] || '') + '. ' + ds.Driver.familyName,
        team,
        color: TEAM_COLORS[team] || '#CCCCCC',
        pts: Number(ds.points),
        gap: Number(ds.points) - leaderPts
      };
    });
    teamsData = cList.map(cs => {
      const team = normalizeTeamName(cs.Constructor.constructorId, cs.Constructor.name);
      return {
        pos: Number(cs.position),
        name: team,
        color: TEAM_COLORS[team] || '#CCCCCC',
        pts: Number(cs.points),
        gap: Number(cs.points) - leaderPtsC
      };
    });
    fillDrivers();
    fillTeams();
  } catch(err){
    document.getElementById('driversList').innerHTML =
      `<div style="padding:20px; text-align:center; color:var(--text-2); font-size:13px;">Classifica non disponibile al momento (${err.message}). Riprova tra poco.</div>`;
  }
}

function fmtGap(g){ return g===0 ? '—' : (g>0?'+':'') + g; }

function driverRowHTML(d, isFav){
  return `
    <div class="rank-row">
      <button class="star-btn${isFav?' on':''}" data-fav="drivers" data-name="${d.name}">${isFav?'★':'☆'}</button>
      <div class="rank-num">${d.pos}</div>
      <div class="team-badge" style="background:${d.color}"><span style="color:${contrastText(d.color)}">${TEAM_CODES[d.team]||'—'}</span></div>
      <div class="rank-info">
        <div class="rank-name"><span class="num-badge" style="background:${d.color}; color:${contrastText(d.color)}; border:1px solid rgba(0,0,0,.12)">${d.num}</span>${d.name}</div>
        <div class="rank-team">${d.team}</div>
      </div>
      <div class="rank-right">
        <div class="rank-pts">${d.pts}</div>
        <div class="rank-gap">${fmtGap(d.gap)}</div>
      </div>
    </div>`;
}
function teamRowHTML(t, isFav){
  return `
    <div class="rank-row">
      <button class="star-btn${isFav?' on':''}" data-fav="teams" data-name="${t.name}">${isFav?'★':'☆'}</button>
      <div class="rank-num">${t.pos}</div>
      <div class="team-badge" style="background:${t.color}"><span style="color:${contrastText(t.color)}">${TEAM_CODES[t.name]||'—'}</span></div>
      <div class="rank-info"><div class="rank-name">${t.name}</div></div>
      <div class="rank-right">
        <div class="rank-pts">${t.pts}</div>
        <div class="rank-gap">${fmtGap(t.gap)}</div>
      </div>
    </div>`;
}
function fillDrivers(){
  const el = document.getElementById('driversList');
  const favs = getFavs('paddock_fav_drivers');
  const favItems = driversData.filter(d=>favs.includes(d.name));
  let html = '';
  if(favItems.length) html += `<div class="fav-block"><div class="fav-label">Preferiti</div>${favItems.map(d=>driverRowHTML(d,true)).join('')}</div>`;
  html += driversData.map(d=>driverRowHTML(d, favs.includes(d.name))).join('');
  el.innerHTML = html;
}
function fillTeams(){
  const el = document.getElementById('teamsList');
  const favs = getFavs('paddock_fav_teams');
  const favItems = teamsData.filter(t=>favs.includes(t.name));
  let html = '';
  if(favItems.length) html += `<div class="fav-block"><div class="fav-label">Preferiti</div>${favItems.map(t=>teamRowHTML(t,true)).join('')}</div>`;
  html += teamsData.map(t=>teamRowHTML(t, favs.includes(t.name))).join('');
  el.innerHTML = html;
}

document.getElementById('driversList').addEventListener('click', handleStarClick);
document.getElementById('teamsList').addEventListener('click', handleStarClick);
function handleStarClick(e){
  const btn = e.target.closest('.star-btn');
  if(!btn) return;
  const key = btn.dataset.fav === 'drivers' ? 'paddock_fav_drivers' : 'paddock_fav_teams';
  toggleFav(key, btn.dataset.name);
  if(btn.dataset.fav === 'drivers') fillDrivers(); else fillTeams();
  recalcAccordionHeight('acc-classifica');
}

document.querySelectorAll('#tabsBox .tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('#tabsBox .tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    const isDrivers = tab.dataset.tab === 'drivers';
    document.getElementById('driversList').style.display = isDrivers ? 'flex' : 'none';
    document.getElementById('teamsList').style.display = isDrivers ? 'none' : 'flex';
    recalcAccordionHeight('acc-classifica');
  });
});

document.getElementById('refreshBtn').addEventListener('click', async ()=>{
  const btn = document.getElementById('refreshBtn');
  btn.innerHTML = '<span class="dot"></span>Aggiornamento…';
  await loadStandings();
  btn.innerHTML = '<span class="dot"></span>Aggiornato ✓';
  recalcAccordionHeight('acc-classifica');
  setTimeout(()=>{ btn.innerHTML = '<span class="dot"></span>Aggiorna classifica'; }, 1400);
});

// ============================================================
// CALENDARIO / ROUND STRIP
// ============================================================
async function loadCalendarAndCircuit(){
  try{
    const seasonRes = await fetchJSON(`${API_BASE}/current.json`);
    seasonRaces = seasonRes.MRData.RaceTable.Races;

    if(!seasonRaces.length){
      document.getElementById('circuitPanel').innerHTML =
        `<div style="text-align:center; padding:20px; color:var(--text-2); grid-column:1/-1;">Calendario non disponibile al momento.</div>`;
      return;
    }

    const currentRace = pickCurrentRace(seasonRaces);
    showRound(currentRace);
    updateHeaderNext();
    setInterval(updateHeaderNext, 30000);
    setInterval(recheckCurrentWeekend, 5 * 60000);
  } catch(err){
    document.getElementById('circuitPanel').innerHTML =
      `<div style="text-align:center; padding:20px; color:var(--text-2); grid-column:1/-1;">Calendario non disponibile al momento (${err.message}).</div>`;
  }
}

function pickCurrentRace(races){
  const now = new Date();
  let currentRace = races.find(r => {
    const s = buildSessions(r);
    return s.length && s[s.length - 1].dt > now;
  });
  const seasonOver = !currentRace;
  if(seasonOver) currentRace = races[races.length - 1];

  nextRoundGlobal = currentRace.round;
  headerSessions = seasonOver ? [] : buildSessions(currentRace);

  if(seasonOver){
    document.getElementById('nextLabel').textContent = 'Stagione conclusa';
    document.getElementById('nextName').textContent = '—';
  }
  return currentRace;
}

// Se l'app resta aperta a lungo (es. installata come PWA), questo controlla
// periodicamente se il weekend "corrente" è terminato e, in tal caso, passa
// da solo al prossimo GP — ma solo se l'utente stava seguendo proprio quello
// corrente, senza spostarlo se sta sfogliando manualmente un altro GP.
async function recheckCurrentWeekend(){
  if(!headerSessions.length) return; // stagione conclusa, niente da ricontrollare
  const lastSession = headerSessions[headerSessions.length - 1];
  if(lastSession.dt > new Date()) return; // il weekend corrente non è ancora finito

  try{
    const seasonRes = await fetchJSON(`${API_BASE}/current.json`);
    seasonRaces = seasonRes.MRData.RaceTable.Races;
    const wasFollowingCurrent = displayedRound === nextRoundGlobal;
    const newCurrentRace = pickCurrentRace(seasonRaces);
    if(wasFollowingCurrent){
      showRound(newCurrentRace);
    }
    updateHeaderNext();
  } catch(err){
    // silenzioso: riproveremo al prossimo giro dei 5 minuti
  }
}

function renderRoundStrip(races, activeRound){
  const el = document.getElementById('roundStrip');
  const now = new Date();
  el.innerHTML = races.map(r=>{
    const raceDate = new Date(r.date + 'T' + (r.time || '00:00:00Z'));
    const done = raceDate < now && r.round !== activeRound;
    const active = r.round === activeRound;
    return `<div class="round${done?' done':''}${active?' active':''}" data-round="${r.round}"><span class="n">${String(r.round).padStart(2,'0')}</span>${r.raceName.replace(' Grand Prix','')}</div>`;
  }).join('');
}

document.getElementById('roundStrip').addEventListener('click', (e)=>{
  const el = e.target.closest('.round');
  if(!el) return;
  const race = seasonRaces.find(r => r.round === el.dataset.round);
  if(race) showRound(race);
});

function showRound(race){
  displayedRound = race.round;
  const strip = document.getElementById('roundStrip');
  const scrollLeft = strip.scrollLeft;
  renderRoundStrip(seasonRaces, race.round);
  strip.scrollLeft = scrollLeft;
  renderCircuitPanel(race);
}

function buildSessions(race){
  const sessions = [];
  const d = (obj) => (obj && obj.date && obj.time) ? new Date(obj.date + 'T' + obj.time) : null;
  const add = (key, label, obj) => { const dt = d(obj); if(dt) sessions.push({key, label, dt}); };
  add('fp1', 'Prove Libere 1', race.FirstPractice);
  add('fp2', 'Prove Libere 2', race.SecondPractice);
  add('fp3', 'Prove Libere 3', race.ThirdPractice);
  add('sprintquali', 'Qualifiche Sprint', race.SprintQualifying);
  add('sprint', 'Sprint', race.Sprint);
  add('quali', 'Qualifiche', race.Qualifying);
  add('race', 'Gara', (race.date && race.time) ? {date:race.date, time:race.time} : null);
  sessions.sort((a,b)=>a.dt-b.dt);
  return sessions;
}

async function renderCircuitPanel(race){
  const circuitId = race.Circuit.circuitId;
  const mappedId = CIRCUIT_ID_MAP[circuitId];
  const trackData = mappedId ? CIRCUITS[mappedId] : null;

  document.getElementById('circuitAccTitle').textContent = `Circuito — ${race.raceName}, Round ${race.round}`;

  const sessions = buildSessions(race);

  const fmtTime = (dt) => dt.toLocaleString('it-IT', { weekday:'short', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });

  const sessionListHTML = sessions.length
    ? sessions.map(s=>
        `<li id="li-${s.key}"><span>${s.label}</span><span class="time mono">${fmtTime(s.dt)}</span></li>`
      ).join('')
    : `<li style="justify-content:center; color:var(--text-2); border-left-color:var(--border);">Informazioni non ancora disponibili, riprova più avanti</li>`;

  const trackSvgHTML = trackData
    ? `<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg">${trackData.svg}</svg>`
    : `<div style="font-size:12px; color:var(--text-2); text-align:center; padding:20px 0;">Tracciato non disponibile</div>`;

  document.getElementById('circuitPanel').innerHTML = `
    <div>
      <div class="circuit-name">${race.Circuit.circuitName}</div>
      <div class="circuit-loc">${race.Circuit.Location.locality}, ${race.Circuit.Location.country}</div>
      <div class="track-svg" id="trackSvgHolder">${trackSvgHTML}</div>
      ${trackData ? `<div class="track-meta"><div>Lunghezza <b>${(trackData.length_m/1000).toFixed(3)} km</b></div></div>` : ''}
    </div>
    <div><ul class="session-list" id="sessionListEl">${sessionListHTML}</ul></div>
    <div class="weather-list" id="weatherList"><div style="font-size:12px; color:var(--text-2); text-align:center; padding:10px 0;">Caricamento meteo…</div></div>
    <div class="records" id="recordsList"></div>
  `;

  recalcAccordionHeight('acc-circuito');
  updateHeaderNext();
  loadWeather(race.Circuit.Location.lat, race.Circuit.Location.long, sessions, race.round);
  loadCircuitRecord(circuitId, race.season, race.round);
  loadSessionResults(race);
}

// ============================================================
// CLASSIFICHE DI SESSIONE (solo Qualifiche e Gara — l'API non ha un
// endpoint per le prove libere, quindi non le mostriamo per non promettere
// un dato che non esiste)
// ============================================================
let currentSessionRace = null;
let sessionAutoRefreshTimer = null;

function sessionRowHTML(pos, name, team, num, valueLabel){
  const color = TEAM_COLORS[team] || '#CCCCCC';
  return `
    <div class="rank-row">
      <div class="rank-num">${pos}</div>
      <div class="team-badge" style="background:${color}"><span style="color:${contrastText(color)}">${TEAM_CODES[team]||'—'}</span></div>
      <div class="rank-info">
        <div class="rank-name"><span class="num-badge" style="background:${color}; color:${contrastText(color)}; border:1px solid rgba(0,0,0,.12)">${num}</span>${name}</div>
        <div class="rank-team">${team}</div>
      </div>
      <div class="rank-right"><div class="rank-pts mono">${valueLabel}</div></div>
    </div>`;
}
function emptyState(msg){
  return `<div style="padding:22px 8px; text-align:center; color:var(--text-2); font-size:13px;">${msg}</div>`;
}

async function loadSessionResults(race){
  currentSessionRace = race;
  const forRound = race.round;
  const qEl = document.getElementById('qualiList');
  const rEl = document.getElementById('raceResList');

  try{
    const qRes = await fetchJSON(`${API_BASE}/${race.season}/${race.round}/qualifying.json`);
    if(forRound !== displayedRound) return;
    const qRace = qRes.MRData.RaceTable.Races[0];
    if(qRace && qRace.QualifyingResults?.length){
      qEl.innerHTML = qRace.QualifyingResults.map(q => {
        const team = normalizeTeamName(q.Constructor.constructorId, q.Constructor.name);
        const time = q.Q3 || q.Q2 || q.Q1 || '—';
        return sessionRowHTML(q.position, `${q.Driver.givenName[0]}. ${q.Driver.familyName}`, team, q.Driver.permanentNumber || q.number, time);
      }).join('');
    } else {
      qEl.innerHTML = emptyState('Qualifiche non ancora disputate o risultato non ancora pubblicato.');
    }
  } catch(err){
    if(forRound === displayedRound) qEl.innerHTML = emptyState('Dati non disponibili al momento.');
  }

  try{
    const rRes = await fetchJSON(`${API_BASE}/${race.season}/${race.round}/results.json`);
    if(forRound !== displayedRound) return;
    const rRace = rRes.MRData.RaceTable.Races[0];
    if(rRace && rRace.Results?.length){
      rEl.innerHTML = rRace.Results.map(r => {
        const team = normalizeTeamName(r.Constructor.constructorId, r.Constructor.name);
        // il "+" ha senso solo davanti a un distacco in tempo/giri, non davanti a
        // uno stato come "Ritirato" o "Incidente"
        let value;
        if(r.position === '1'){
          value = r.Time?.time || 'Vincitore';
        } else if(r.Time?.time){
          value = '+' + r.Time.time;
        } else {
          value = r.status; // es. "Retired", "Accident", "+1 Lap" ecc.
        }
        return sessionRowHTML(r.position, `${r.Driver.givenName[0]}. ${r.Driver.familyName}`, team, r.Driver.permanentNumber || r.number, value);
      }).join('');
    } else {
      rEl.innerHTML = emptyState('Gara non ancora disputata o risultato non ancora pubblicato.');
    }
  } catch(err){
    if(forRound === displayedRound) rEl.innerHTML = emptyState('Dati non disponibili al momento.');
  }
  recalcAccordionHeight('acc-sessioni');
}

document.querySelectorAll('#sessionTabsBox .tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('#sessionTabsBox .tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    const isQuali = tab.dataset.stab === 'quali';
    document.getElementById('qualiList').style.display = isQuali ? 'flex' : 'none';
    document.getElementById('raceResList').style.display = isQuali ? 'none' : 'flex';
    recalcAccordionHeight('acc-sessioni');
  });
});

document.getElementById('sessionRefreshBtn').addEventListener('click', async ()=>{
  const btn = document.getElementById('sessionRefreshBtn');
  btn.innerHTML = '<span class="dot"></span>Aggiornamento…';
  if(currentSessionRace) await loadSessionResults(currentSessionRace);
  btn.innerHTML = '<span class="dot"></span>Aggiornato ✓';
  setTimeout(()=>{ btn.innerHTML = '<span class="dot"></span>Aggiorna ora'; }, 1200);
});

// auto-refresh ogni 30s, ma solo mentre la sezione è effettivamente aperta
// (per non tempestare inutilmente un'API gratuita mantenuta da volontari)
setInterval(()=>{
  const item = document.getElementById('acc-sessioni')?.closest('.accordion-item');
  if(item && item.classList.contains('open') && currentSessionRace){
    loadSessionResults(currentSessionRace);
  }
}, 30000);

// ---------- METEO (Open-Meteo, gratuito, no key) ----------
async function loadWeather(lat, lon, sessions, forRound){
  const el = document.getElementById('weatherList');
  try{
    const uniqueDaysUTC = [...new Set(sessions.map(s => s.dt.toISOString().slice(0,10)))];
    // richiediamo un giorno di margine per lato: alle date estreme (fusi molto
    // lontani dall'UTC, es. Las Vegas, Suzuka, Singapore) il giorno "locale" del
    // circuito può cadere fuori dal giorno UTC calcolato qui sopra
    const pad = (dayStr, delta) => {
      const dt = new Date(dayStr + 'T12:00:00Z');
      dt.setUTCDate(dt.getUTCDate() + delta);
      return dt.toISOString().slice(0,10);
    };
    const start = pad(uniqueDaysUTC[0], -1);
    const end = pad(uniqueDaysUTC[uniqueDaysUTC.length-1], 1);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,precipitation_probability_max&timezone=auto&start_date=${start}&end_date=${end}`;
    const data = await fetchJSON(url);
    if(forRound !== displayedRound) return; // l'utente ha già cambiato GP nel frattempo
    if(!data.daily || !data.daily.time.length) throw new Error('no-data');

    // Open-Meteo restituisce l'offset locale del circuito: lo usiamo per calcolare
    // i giorni REALI del weekend (invece del margine UTC) e mostrare solo quelli
    // — così non compare più, ad es., il lunedì dopo gara
    const offsetSec = data.utc_offset_seconds || 0;
    const realDays = new Set(sessions.map(s => new Date(s.dt.getTime() + offsetSec*1000).toISOString().slice(0,10)));

    const icons = (rain) => rain >= 50 ? '🌧️' : rain >= 25 ? '🌦️' : '☀️';
    const rows = data.daily.time.map((day, i)=>{
      if(!realDays.has(day)) return null; // scarta i giorni di margine, non del weekend
      const dt = new Date(day + 'T12:00:00');
      const dayLabel = dt.toLocaleDateString('it-IT', {weekday:'short'});
      const temp = Math.round(data.daily.temperature_2m_max[i]);
      const rain = Math.round(data.daily.precipitation_probability_max[i]);
      return `<div class="weather-row"><span class="icon">${icons(rain)}</span><span class="day">${dayLabel}</span><span>Pioggia <span class="rain">${rain}%</span></span><span class="temp mono">${temp}°C</span></div>`;
    }).filter(Boolean);

    el.innerHTML = rows.length ? rows.join('') : `<div style="font-size:12px; color:var(--text-2); text-align:center; padding:10px 0;">Previsioni non ancora disponibili per queste date</div>`;
  } catch(err){
    if(forRound !== displayedRound) return;
    const isPast = sessions.length && sessions[sessions.length-1].dt < new Date();
    const msg = isPast
      ? 'Meteo non disponibile per un weekend già concluso.'
      : 'Previsioni non ancora disponibili (di solito escono ~15 giorni prima)';
    el.innerHTML = `<div style="font-size:12px; color:var(--text-2); text-align:center; padding:10px 0;">${msg}</div>`;
  }
}

// ---------- RECORD (pole + giro veloce edizione precedente) ----------
async function loadCircuitRecord(circuitId, season, forRound){
  const el = document.getElementById('recordsList');
  const prevYear = Number(season) - 1;
  try{
    const [qRes, rRes] = await Promise.all([
      fetchJSON(`${API_BASE}/${prevYear}/circuits/${circuitId}/qualifying.json`),
      fetchJSON(`${API_BASE}/${prevYear}/circuits/${circuitId}/results.json`)
    ]);
    if(forRound !== displayedRound) return; // GP cambiato nel frattempo
    const qRace = qRes.MRData.RaceTable.Races[0];
    const rRace = rRes.MRData.RaceTable.Races[0];
    if(!qRace || !rRace) throw new Error('no-data');

    const poleResult = qRace.QualifyingResults.find(q => q.position === '1');
    const poleTime = poleResult ? (poleResult.Q3 || poleResult.Q2 || poleResult.Q1) : null;
    const poleDriver = poleResult ? `${poleResult.Driver.givenName[0]}. ${poleResult.Driver.familyName}` : '—';

    const flResult = rRace.Results.find(r => r.FastestLap && r.FastestLap.rank === '1');
    const flTime = flResult ? flResult.FastestLap.Time.time : null;
    const flDriver = flResult ? `${flResult.Driver.givenName[0]}. ${flResult.Driver.familyName}` : '—';

    el.innerHTML = `
      <div class="record-badge"><span class="tag">POLE ${prevYear}</span><div><div class="val mono">${poleTime || '—'}</div><div class="who">${poleDriver}</div></div></div>
      <div class="record-badge"><span class="tag">GIRO VELOCE ${prevYear}</span><div><div class="val mono">${flTime || '—'}</div><div class="who">${flDriver}</div></div></div>
    `;
  } catch(err){
    if(forRound !== displayedRound) return;
    el.innerHTML = `<div style="font-size:12px; color:var(--text-2); padding:6px 0;">Record dell'edizione precedente non disponibili per questo circuito.</div>`;
  }
}

// ============================================================
// PROSSIMA SESSIONE + COUNTDOWN
// ============================================================
function updateHeaderNext(){
  const now = new Date();
  const next = headerSessions.find(s => s.dt > now);
  const label = document.getElementById('nextLabel');
  const name = document.getElementById('nextName');

  document.querySelectorAll('.session-list li').forEach(li=>li.classList.remove('race'));

  if(next){
    label.textContent = 'Prossima sessione';
    name.textContent = next.label;
    tickTo(next.dt);
    if(displayedRound === nextRoundGlobal){
      const li = document.getElementById('li-' + next.key);
      if(li) li.classList.add('race');
    }
  } else if(headerSessions.length){
    label.textContent = 'Weekend concluso';
    name.textContent = '—';
    if(countdownTimer) clearInterval(countdownTimer);
  }
}
function tickTo(target){
  if(countdownTimer) clearInterval(countdownTimer);
  function tick(){
    const diff = Math.max(0, target - new Date());
    const dd = Math.floor(diff/86400000);
    const hh = Math.floor(diff/3600000)%24;
    const mm = Math.floor(diff/60000)%60;
    const ss = Math.floor(diff/1000)%60;
    document.getElementById('cd-d').textContent = String(dd).padStart(2,'0');
    document.getElementById('cd-h').textContent = String(hh).padStart(2,'0');
    document.getElementById('cd-m').textContent = String(mm).padStart(2,'0');
    document.getElementById('cd-s').textContent = String(ss).padStart(2,'0');
  }
  tick();
  countdownTimer = setInterval(tick, 1000);
}


// ============================================================
// ACCORDION
// ============================================================
function recalcAccordionHeight(id){
  const body = document.getElementById(id);
  if(body && body.parentElement.classList.contains('open')){
    body.style.maxHeight = body.scrollHeight + 'px';
  }
}
document.querySelectorAll('.accordion-header').forEach(header=>{
  const item = header.closest('.accordion-item');
  const body = header.nextElementSibling;
  header.addEventListener('click', ()=>{
    const isOpen = item.classList.contains('open');
    if(isOpen){
      body.style.maxHeight = body.scrollHeight + 'px';
      requestAnimationFrame(()=>{ body.style.maxHeight = '0px'; });
      item.classList.remove('open');
    } else {
      item.classList.add('open');
      body.style.maxHeight = body.scrollHeight + 'px';
    }
  });
});
const heightObserver = new MutationObserver(()=>{
  document.querySelectorAll('.accordion-item.open .accordion-body').forEach(body=>{
    body.style.maxHeight = body.scrollHeight + 'px';
  });
});
heightObserver.observe(document.querySelector('main'), {childList:true, subtree:true});

// ============================================================
// NOTIFICHE PUSH (15 minuti prima di ogni sessione)
// ============================================================
const VAPID_PUBLIC_KEY = 'BAvR6coYIK31AcmKggJ-WenUMmGxDIJGultFoXCwY4P-thQRG_-bg5xxMAIar3lxijS1lRjD2FcA6ShKnN-cmg8';

function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function setupNotifyButton(){
  const btn = document.getElementById('notifyBtn');
  if(!btn) return;

  if(!('serviceWorker' in navigator) || !('PushManager' in window)){
    btn.innerHTML = '<span class="dot"></span>Notifiche non supportate su questo browser';
    btn.disabled = true;
    return;
  }

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  updateNotifyBtn(!!existing);

  btn.addEventListener('click', async () => {
    const current = await reg.pushManager.getSubscription();
    if(current){
      // disattiva
      await fetch('/.netlify/functions/unsubscribe', {
        method:'POST', body: JSON.stringify({ endpoint: current.endpoint })
      }).catch(()=>{});
      await current.unsubscribe();
      updateNotifyBtn(false);
      return;
    }

    const permission = await Notification.requestPermission();
    if(permission !== 'granted'){
      btn.innerHTML = '<span class="dot"></span>Permesso negato — abilita dalle impostazioni del browser';
      return;
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    await fetch('/.netlify/functions/subscribe', {
      method:'POST', body: JSON.stringify(sub)
    });
    updateNotifyBtn(true);
  });
}
function updateNotifyBtn(isOn){
  const btn = document.getElementById('notifyBtn');
  if(!btn) return;
  btn.innerHTML = isOn
    ? '<span class="dot"></span>Notifiche attive — tocca per disattivare'
    : '<span class="dot"></span>Attiva notifiche sessioni';
}
setupNotifyButton();

// ============================================================
// AVVIO
// ============================================================
loadCalendarAndCircuit();
loadStandings();
