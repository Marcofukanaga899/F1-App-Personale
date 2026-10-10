// ============================================================
// MONDIALE IN GARA — replay giro per giro (dati storici OpenF1 + Jolpica)
// Punti di partenza = classifica prima del GP (+ eventuale Sprint);
// a ogni giro assegna i punti della gara in base alla posizione in pista.
// ============================================================
const PTS = [25,18,15,12,10,8,6,4,2,1];
const SPRINT_PTS = [8,7,6,5,4,3,2,1];   // Sprint: 8-7-6-5-4-3-2-1, nessun punto per il giro veloce (né Sprint né gara)
// nome del team come lo scrive il flusso F1 / OpenF1 ("RED BULL RACING", "Visa Cash App Racing Bulls"...) -> nome usato nell'app
function normTeam(raw){
  const t = String(raw || '').toLowerCase();
  if(!t) return null;
  if(/racing bulls|\brb\b|alphatauri|alpha tauri|toro rosso/.test(t)) return 'Racing Bulls';   // prima di Red Bull: il nome lo contiene
  if(/red bull/.test(t)) return 'Red Bull';
  if(/sauber|audi/.test(t)) return 'Audi';
  for(const k of ['Mercedes','Ferrari','McLaren','Alpine','Aston Martin','Williams','Haas','Cadillac']) if(t.includes(k.toLowerCase())) return k;
  return null;
}
const mnd = { race:null, data:null, lap:0, kind:'drivers' };

async function jol(path){ try{ return (await fetchJSON(`${API_BASE}/${path}`)).MRData; }catch(e){ return null; } }

async function loadBaseline(race, skipSprint){
  const prev = race.round > 1 ? race.round - 1 : null;
  const [dsM, csM, spM] = await Promise.all([
    prev ? jol(`${race.season}/${prev}/driverStandings.json`) : null,
    prev ? jol(`${race.season}/${prev}/constructorStandings.json`) : null,
    skipSprint ? null : jol(`${race.season}/${race.round}/sprint.json`)
  ]);
  const base = {}, team = {}, teamBase = {};
  (dsM?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || []).forEach(x => {
    const k = x.Constructors[x.Constructors.length - 1];
    base[x.Driver.code] = +x.points; team[x.Driver.code] = normalizeTeamName(k.constructorId, k.name);
  });
  (csM?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings || []).forEach(x => {
    teamBase[normalizeTeamName(x.Constructor.constructorId, x.Constructor.name)] = +x.points;
  });
  (spM?.RaceTable?.Races?.[0]?.SprintResults || []).forEach(r => {  // punti Sprint dello stesso weekend
    const c = r.Driver.code, t = team[c]; base[c] = (base[c] || 0) + +r.points;
    if(t) teamBase[t] = (teamBase[t] || 0) + +r.points;
  });
  return { base, team, teamBase };
}

async function buildMondiale(race, s){
  const { base, team, teamBase } = await loadBaseline(race);
  const k = s.session_key;
  const drivers = await of1(`/drivers?session_key=${k}`); await tlmSleep(400);
  const laps = await of1(`/laps?session_key=${k}`); await tlmSleep(400);
  const pos = await of1(`/position?session_key=${k}`); await tlmSleep(400);
  const res = await of1(`/session_result?session_key=${k}`);

  const D = {};
  drivers.forEach(d => {
    const t = normTeam(d.team_name) || team[d.name_acronym] || d.team_name;   // squadra di QUEL weekend (es. Lawson)
    D[d.driver_number] = { code:d.name_acronym, name:`${(d.first_name||'?')[0]}. ${d.last_name||d.name_acronym}`, team:t,
      color: TEAM_COLORS[t] || '#' + (d.team_colour || 'CCCCCC') };
  });
  const total = Math.max(...laps.map(l => l.lap_number));
  const starts = {};  // istante in cui il primo pilota inizia il giro L (= fine del giro L-1)
  laps.forEach(l => { if(l.date_start){ const t = +new Date(l.date_start); if(!starts[l.lap_number] || t < starts[l.lap_number]) starts[l.lap_number] = t; } });
  const recs = pos.map(p => ({ t:+new Date(p.date), n:p.driver_number, p:p.position })).sort((a,b) => a.t - b.t);
  const cur = {}, snaps = []; let i = 0;
  for(let L = 1; L < total; L++){
    const T = starts[L + 1];
    if(T) while(i < recs.length && recs[i].t <= T){ cur[recs[i].n] = recs[i].p; i++; }
    snaps[L] = { ...cur };
  }
  const fin = {};  // ultimo giro = classifica ufficiale (squalificati senza punti)
  res.forEach(r => { fin[r.driver_number] = (r.dsq || !r.position) ? null : r.position; });
  snaps[total] = fin;
  return { D, base, teamBase, snaps, total };
}

function mndStandings(lap){
  const d = mnd.data, pl = {}, tl = {};
  Object.entries(d.D).forEach(([n, x]) => {
    const p = lap === 0 ? null : d.snaps[lap]?.[n], g = (p && PTS[p - 1]) || 0;
    pl[n] = { x, total:(d.base[x.code] || 0) + g, gain:g };
    tl[x.team] = tl[x.team] || { name:x.team, color:x.color, total:d.teamBase[x.team] || 0, gain:0 };
    tl[x.team].gain += g;
  });
  Object.values(tl).forEach(t => t.total += t.gain);
  const sort = o => Object.values(o).sort((a,b) => b.total - a.total || b.gain - a.gain);
  return { drivers: sort(pl), teams: sort(tl) };
}

function mndRow(rank, moved, color, badge, name, sub, total, gain, drv){
  const mv = moved > 0 ? `<span style="color:#1CB854">▲${moved}</span>` : moved < 0 ? `<span style="color:var(--red)">▼${-moved}</span>` : '';
  return `<div class="rank-row">${posBadgeHTML(rank)}
    ${drvBadge(drv, color, badge)}
    <div class="rank-info"><div class="rank-name">${name}</div><div class="rank-team">${sub}</div></div>
    <div class="rank-right"><div class="rank-pts mono">${total}</div>
    <div class="rank-gap">${gain ? '+' + gain + ' ' : ''}${mv}</div></div></div>`;
}

function renderMondiale(full){
  const d = mnd.data, el = document.getElementById('mndList'); if(!d || !el) return;
  if(full){
    document.getElementById('mndSlider').innerHTML = `<div class="mnd-top"><span>Dopo il giro <b id="mndLap"></b> / ${d.total}</span>
      <input type="range" id="mndRange" min="0" max="${d.total}" value="${mnd.lap}"></div>`;
    document.getElementById('mndRange').addEventListener('input', e => { mnd.lap = +e.target.value; renderMondiale(false); });
  }
  document.getElementById('mndLap').textContent = mnd.lap === 0 ? 'pre-gara' : mnd.lap;
  const now = mndStandings(mnd.lap), start = mndStandings(0);
  const key = mnd.kind === 'drivers' ? 'drivers' : 'teams';
  const id = x => key === 'drivers' ? x.x.code : x.name;
  const startRank = {}; start[key].forEach((x, i) => startRank[id(x)] = i + 1);
  el.innerHTML = now[key].map((x, i) => {
    const moved = startRank[id(x)] - (i + 1);
    return key === 'drivers' ? mndRow(i + 1, moved, x.x.color, x.x.code, x.x.name, x.x.team, x.total, x.gain, x.x.code)
                             : mndRow(i + 1, moved, x.color, TEAM_CODES[x.name] || x.name.slice(0,3).toUpperCase(), x.name, 'Costruttori', x.total, x.gain);
  }).join('');
  recalcAccordionHeight('acc-mondiale');
}

async function loadMondiale(){
  const race = mnd.race, el = document.getElementById('mndList'); if(!race || !el || mnd.data) return;
  const forRound = race.round;
  el.innerHTML = emptyState('Caricamento dati gara…');
  try{
    const s = await findOf1Session(race, 'race');
    if(!s){ el.innerHTML = emptyState('Gara non ancora disputata o dati non ancora disponibili.'); return; }
    const data = await buildMondiale(race, s);
    if(forRound !== displayedRound) return;
    mnd.data = data; mnd.lap = data.total; renderMondiale(true);
  } catch(err){ if(forRound === displayedRound) el.innerHTML = emptyState('Dati non disponibili al momento.'); }
}
function setMondialeRace(race){
  mnd.race = race; mnd.data = null;
  document.getElementById('mndSlider').innerHTML = '';
  document.getElementById('mndList').innerHTML = emptyState('Apri la sezione per caricare la gara.');
  if(paneActive('pane-mnd')) loadMondiale();
}
document.addEventListener('pane-shown', () => { if(paneActive('pane-mnd')) loadMondiale(); });
document.querySelectorAll('#mndTabs .tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('#mndTabs .tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active'); mnd.kind = tab.dataset.mk; renderMondiale(false);
}));

// se il calendario è arrivato prima di questo script, recupera il GP già mostrato
(function(){ try{ if(typeof seasonRaces !== 'undefined' && seasonRaces.length && displayedRound && !mnd.race){
  const r = seasonRaces.find(x => x.round == displayedRound); if(r) setMondialeRace(r); } }catch(e){} })();
