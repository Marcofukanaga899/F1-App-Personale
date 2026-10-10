// ============================================================
// GIRI & SETTORI — dati da OpenF1 (api.openf1.org), stessa fonte
// di dati cronometrici su cui si basa anche FastF1.
// Modulo separato: app.js lo chiama con loadTelemetry(race).
// ============================================================
const OPENF1 = 'https://api.openf1.org/v1';
const tlmCache = new Map();
let tlmKind = 'quali';
let tlmRace = null;
let tlmPending = false;
let tlmData = null;
const tlmSleep = ms => new Promise(r => setTimeout(r, ms));
const TYRES = { SOFT:['S','#E10600','#fff'], MEDIUM:['M','#FFD12E','#15151E'], HARD:['H','#EDEDED','#15151E'], INTERMEDIATE:['I','#1CB854','#fff'], WET:['W','#0A7EC2','#fff'] };

async function of1(path){
  for(let i = 0; i < 3; i++){
    const res = await fetch(OPENF1 + path);
    if(res.status === 429){ await tlmSleep(800 * (i + 1)); continue; }
    if(!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }
  throw new Error('Troppe richieste');
}
function fmtLap(s){
  if(s == null) return '—';
  const m = Math.floor(s / 60);
  return m ? `${m}:${(s - m * 60).toFixed(3).padStart(6, '0')}` : s.toFixed(3);
}
async function findOf1Session(race, kind){
  const name = kind === 'quali' ? 'Qualifying' : 'Race';
  const day = kind === 'quali' ? race.Qualifying?.date : race.date;
  if(!day) return null;
  const list = await of1(`/sessions?year=${race.season}&session_name=${name}`);
  const t = new Date(day + 'T12:00:00Z').getTime();
  let best = null, bd = Infinity;
  list.forEach(s => { const d = Math.abs(new Date(s.date_start).getTime() - t); if(d < bd){ bd = d; best = s; } });
  return bd < 2 * 864e5 ? best : null;
}
async function buildTelemetry(race, kind){
  const s = await findOf1Session(race, kind);
  if(!s) return null;
  const drivers = await of1(`/drivers?session_key=${s.session_key}`); await tlmSleep(400);
  const laps = await of1(`/laps?session_key=${s.session_key}`);
  let stints = [];
  if(kind === 'race'){ await tlmSleep(400); stints = await of1(`/stints?session_key=${s.session_key}`); }
  const D = {};
  drivers.forEach(d => D[d.driver_number] = { d, best:null, sec:[null,null,null], top:0, stints:[] });
  laps.forEach(l => {
    const x = D[l.driver_number]; if(!x) return;
    if(l.lap_duration && (x.best == null || l.lap_duration < x.best)) x.best = l.lap_duration;
    [1,2,3].forEach(i => { const v = l['duration_sector_' + i]; if(v && (x.sec[i-1] == null || v < x.sec[i-1])) x.sec[i-1] = v; });
    if(l.st_speed > x.top) x.top = l.st_speed;
  });
  stints.forEach(st => { const x = D[st.driver_number]; if(x) x.stints.push(st); });
  const rows = Object.values(D).filter(x => x.best != null).sort((a,b) => a.best - b.best);
  const bestSec = [0,1,2].map(i => Math.min(...rows.map(r => r.sec[i]).filter(v => v != null)));
  return { rows, bestSec, laps, stints };
}
function tlmRowHTML(r, pos, leader, bestSec, kind){
  const d = r.d;
  const color = TEAM_COLORS[d.team_name] || '#' + (d.team_colour || 'CCCCCC');
  const name = d.last_name ? `${(d.first_name || d.name_acronym || '?')[0]}. ${d.last_name}` : d.name_acronym;
  const secHTML = r.sec.map((v, i) => {
    const c = v == null ? '' : (v === bestSec[i] ? 'color:var(--purple)' : 'color:#1CB854');
    return `<div><div class="q-label">S${i+1}</div><div class="q-time mono" style="${c}">${v == null ? '—' : v.toFixed(3)}</div></div>`;
  }).join('');
  const stintHTML = r.stints.sort((a,b) => a.stint_number - b.stint_number).map(st => {
    const t = TYRES[(st.compound || '').toUpperCase()] || ['?', '#CCC', '#15151E'];
    const n = st.lap_end && st.lap_start ? st.lap_end - st.lap_start + 1 : '';
    return `<span class="tyre" style="background:${t[1]};color:${t[2]}">${t[0]}${n ? `<small>${n}</small>` : ''}</span>`;
  }).join('');
  return `
    <div class="quali-card tlm-card" data-dn="${d.driver_number}">
      <div class="quali-head">
        ${posBadgeHTML(pos)}
        <div class="team-badge" style="background:${color}"><span style="color:${contrastText(color)}">${d.name_acronym || '—'}</span></div>
        <div class="rank-info"><div class="rank-name"><span class="num-badge" style="background:${color}; color:${contrastText(color)}; border:1px solid rgba(0,0,0,.12)">${d.driver_number}</span>${name}</div></div>
        <div class="rank-right"><div class="rank-pts mono" style="font-size:15px">${fmtLap(r.best)}</div><div class="rank-gap">${pos === 1 ? 'miglior giro' : '+' + (r.best - leader).toFixed(3)}</div></div>
      </div>
      <div class="quali-times">${secHTML}${r.top ? `<div><div class="q-label">Vmax</div><div class="q-time mono">${r.top}</div></div>` : ''}</div>
      ${kind === 'race' && stintHTML ? `<div class="tyre-row">${stintHTML}<span class="tyre-pit">${Math.max(r.stints.length - 1, 0)} soste</span></div>` : ''}
    </div>`;
}
function tlmRender(data, kind){
  if(!data || !data.rows.length) return emptyState('Dati giri non ancora disponibili per questa sessione.');
  const { rows, bestSec } = data;
  const fast = rows[0], vmax = rows.reduce((a,b) => b.top > a.top ? b : a);
  const nm = r => r.d.name_acronym;
  const rec = `<div class="records" style="border-top:none; padding:12px 0 4px">
    <div class="record-badge"><span class="tag">MIGLIOR GIRO</span><div><div class="val">${fmtLap(fast.best)}</div><div class="who">${nm(fast)}</div></div></div>
    ${vmax.top ? `<div class="record-badge"><span class="tag">VMAX</span><div><div class="val">${vmax.top} km/h</div><div class="who">${nm(vmax)}</div></div></div>` : ''}</div>`;
  return rec + rows.map((r, i) => tlmRowHTML(r, i + 1, fast.best, bestSec, kind)).join('');
}
async function loadTelemetry(race, kind){
  tlmRace = race; kind = kind || tlmKind;
  const el = document.getElementById('tlmList'); if(!el) return;
  if(typeof paneActive === 'function' && !paneActive('pane-tlm')){ tlmPending = true; el.innerHTML = emptyState('Apri questa tab per caricare i dati dei giri.'); return; }
  tlmPending = false;
  const forRound = race.round, key = `${race.season}-${race.round}-${kind}`;
  el.innerHTML = emptyState('Caricamento dati giri…');
  try{
    if(!tlmCache.has(key)) tlmCache.set(key, await buildTelemetry(race, kind));
    if(forRound !== displayedRound || kind !== tlmKind) return;
    tlmData = tlmCache.get(key); el.innerHTML = tlmRender(tlmData, kind);
  } catch(err){
    if(forRound === displayedRound) el.innerHTML = emptyState('Dati giri non disponibili al momento.');
  }
  recalcAccordionHeight('acc-sessione');
}
document.querySelectorAll('#tlmTabs .tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('#tlmTabs .tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  tlmKind = tab.dataset.tk;
  if(tlmRace) loadTelemetry(tlmRace, tlmKind);
}));

// ---- Giro per giro di un pilota (tocca la scheda). Viola/verde "fino a quel momento"
function lapTableHTML(data, dn){
  const all = data.laps.filter(l => l.date_start).sort((a,b) => new Date(a.date_start) - new Date(b.date_start));
  const g = [Infinity,Infinity,Infinity,Infinity], pb = {}, st = new Map();
  all.forEach(l => {
    const p = pb[l.driver_number] = pb[l.driver_number] || [Infinity,Infinity,Infinity,Infinity];
    st.set(l, [l.duration_sector_1, l.duration_sector_2, l.duration_sector_3, l.lap_duration].map((v, i) => {
      if(!v) return '';
      const c = v < g[i] ? 'p' : v < p[i] ? 'g' : '';
      if(v < g[i]) g[i] = v; if(v < p[i]) p[i] = v; return c;
    }));
  });
  const mine = data.laps.filter(l => l.driver_number == dn).sort((a,b) => a.lap_number - b.lap_number);
  const cell = (v, c, f) => `<span class="mono lt-${c || 'n'}">${v ? f(v) : '—'}</span>`;
  const rows = mine.map(l => {
    const s = st.get(l) || ['','','',''];
    const stint = data.stints.find(x => x.driver_number == dn && l.lap_number >= x.lap_start && l.lap_number <= x.lap_end);
    const t = stint && TYRES[(stint.compound || '').toUpperCase()];
    return `<div class="lt-row"><span class="mono">${l.lap_number}${l.is_pit_out_lap ? '<small class="lt-out">OUT</small>' : ''}</span>
      ${t ? `<span class="tyre" style="background:${t[1]};color:${t[2]}">${t[0]}</span>` : '<span></span>'}
      ${cell(l.duration_sector_1, s[0], v => v.toFixed(3))}${cell(l.duration_sector_2, s[1], v => v.toFixed(3))}${cell(l.duration_sector_3, s[2], v => v.toFixed(3))}
      ${cell(l.lap_duration, s[3], fmtLap)}</div>`;
  }).join('');
  return `<div class="lap-table"><div class="lt-row lt-head"><span>Giro</span><span></span><span>S1</span><span>S2</span><span>S3</span><span>Tempo</span></div>${rows || emptyState('Nessun giro registrato.')}</div>`;
}
document.getElementById('tlmList').addEventListener('click', e => {
  const card = e.target.closest('.tlm-card'); if(!card || !tlmData) return;
  const open = card.nextElementSibling?.classList.contains('lap-table');
  if(open) card.nextElementSibling.remove(); else card.insertAdjacentHTML('afterend', lapTableHTML(tlmData, card.dataset.dn));
  card.classList.toggle('open', !open);
  recalcAccordionHeight('acc-sessione');
});

// i dati dei giri si caricano solo quando la tab è visibile (risparmia richieste a OpenF1)
document.addEventListener('pane-shown', () => { if(tlmPending && tlmRace && paneActive('pane-tlm')) loadTelemetry(tlmRace); });

// se il calendario è arrivato prima di questo script, recupera il GP già mostrato
(function(){ try{ if(typeof seasonRaces !== 'undefined' && seasonRaces.length && displayedRound && !tlmRace){
  const r = seasonRaces.find(x => x.round == displayedRound); if(r) loadTelemetry(r); } }catch(e){} })();
