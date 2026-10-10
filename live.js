// ============================================================
// MONDIALE LIVE — legge il server f1-livetiming-api che gira sul tuo PC
// (raggiunto via Tailscale). Punti = classifica prima del GP + punti della
// posizione attuale; i ritirati valgono 0. Se il server è spento, non succede nulla.
// ============================================================
const LIVE_KEY = 'paddock_live_url';
const live = { base:null, round:null, timer:null, kind:'drivers' };
// accetta anche indirizzi incollati per intero (es. .../api/status): tiene solo la parte iniziale
const liveUrl = () => { try{ return (localStorage.getItem(LIVE_KEY) || '').trim().replace(/\/api(\/.*)?$/i, '').replace(/\/+$/, ''); }catch(e){ return ''; } };
const liveStatus = (dot, txt) => { document.getElementById('liveStatus').innerHTML = `<span class="live-dot" style="background:${dot}"></span>${txt}`; };
const titleCase = t => (t || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const niceCase = s => s === s.toUpperCase() ? titleCase(s) : s;
// nome breve ("M. Verstappen") anche se il flusso manda solo FullName o BroadcastName
function liveName(l){
  if(l.FirstName && l.LastName) return `${l.FirstName[0]}. ${niceCase(l.LastName)}`;
  const full = (l.FullName || l.BroadcastName || '').trim().split(/\s+/);
  if(full.length > 1) return `${full[0][0].toUpperCase()}. ${niceCase(full.slice(1).join(' '))}`;
  return l.Tla || '—';
}

async function liveGet(path){
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
  try{ const r = await fetch(liveUrl() + path, { signal:ctl.signal }); if(!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally{ clearTimeout(t); }
}

function liveStandings(list, base, table){
  const dl = {}, tl = {};
  list.forEach(d => {
    const g = (d.pos && !d.retired && table[d.pos - 1]) || 0;
    dl[d.code] = { ...d, total:(base.base[d.code] || 0) + g, gain:g };
    tl[d.team] = tl[d.team] || { name:d.team, color:d.color, total:base.teamBase[d.team] || 0, gain:0 };
    tl[d.team].gain += g;
  });
  Object.values(tl).forEach(t => t.total += t.gain);
  const sort = o => Object.values(o).sort((a,b) => b.total - a.total || b.gain - a.gain);
  const startD = [...list].sort((a,b) => (base.base[b.code] || 0) - (base.base[a.code] || 0)).map(d => d.code);
  const startT = Object.keys(tl).sort((a,b) => (base.teamBase[b] || 0) - (base.teamBase[a] || 0));
  return { drivers:sort(dl), teams:sort(tl), startD, startT };
}

function liveRender(list){
  const r = liveStandings(list, live.base, live.sprint ? SPRINT_PTS : PTS), el = document.getElementById('liveList');
  if(live.kind === 'drivers'){
    el.innerHTML = r.drivers.map((x, i) => mndRow(i + 1, r.startD.indexOf(x.code) - i, x.color, x.code, x.name,
      x.retired ? 'Ritirato' : (x.pos ? 'P' + x.pos + ' in pista' : x.team), x.total, x.gain, x.code)).join('');
  } else {
    el.innerHTML = r.teams.map((x, i) => mndRow(i + 1, r.startT.indexOf(x.name) - i, x.color,
      TEAM_CODES[x.name] || x.name.slice(0,3).toUpperCase(), x.name, 'Costruttori', x.total, x.gain)).join('');
  }
  recalcAccordionHeight('acc-mondiale');
}

async function livePoll(){
  const el = document.getElementById('liveList');
  if(!liveUrl()){ liveStatus('#B0B0B8', 'Server non configurato'); el.innerHTML = emptyState('Incolla qui sopra l\'indirizzo del tuo server live e premi Salva.'); return; }
  try{
    const [st, sess, lc, sd] = await Promise.all([liveGet('/api/status'), liveGet('/api/session'), liveGet('/api/lap-count'), liveGet('/api/standings')]);
    if(!mnd.race){ liveStatus('#F5A623', 'Aspetto il calendario…'); return; }
    const type = sess.Session?.Type || '', lap = lc.LapCount || {};
    const isSprint = /sprint/i.test((sess.Session?.Name || '') + ' ' + type) && !/qualif|shootout/i.test((sess.Session?.Name || '') + ' ' + type);
    const key = mnd.race.round + (isSprint ? 's' : '');   // durante la Sprint i punti della Sprint non sono ancora nella base
    if(live.round !== key){ live.base = await loadBaseline(mnd.race, isSprint); live.round = key; }
    live.sprint = isSprint;
    const list = Object.values(sd.Lines || {}).filter(l => l.Tla && l.Position).map(l => {
      const team = normTeam(l.TeamName) || live.base.team[l.Tla] || titleCase(l.TeamName);   // squadra attuale dal flusso, non dalla classifica
      return { code:l.Tla, pos:+l.Position, retired:!!l.Retired, name:liveName(l),
        team, color:TEAM_COLORS[team] || '#' + (l.TeamColour || 'CCCCCC') };
    });
    const isRace = /race|sprint/i.test(type) && !/qualif/i.test(type);
    if(!st.isConnected){ liveStatus('#E10600', 'Il server non è collegato a F1'); }
    else if(!list.length){ liveStatus('#F5A623', 'Server collegato, nessuna sessione in corso'); el.innerHTML = emptyState('Nessun dato di gara per ora: i dati compaiono quando inizia una sessione.'); return; }
    else liveStatus(isRace ? '#1CB854' : '#F5A623', isRace ? `LIVE${isSprint ? ' · Sprint' : ''} · giro ${lap.CurrentLap || '—'}/${lap.TotalLaps || '—'}` : `Sessione: ${sess.Session?.Name || type} (prova: i punti hanno senso solo in gara)`);
    liveRender(list);
  } catch(err){
    liveStatus('#E10600', 'Server non raggiungibile');
    el.innerHTML = emptyState('Controlla che il PC e il server siano accesi e che Tailscale sia attivo sul telefono.');
  }
}

function liveSchedule(){
  const on = paneActive('pane-live');
  if(on && !live.timer){ livePoll(); live.timer = setInterval(() => { if(!document.hidden) livePoll(); }, 4000); }
  else if(!on && live.timer){ clearInterval(live.timer); live.timer = null; }
}
document.getElementById('liveUrlInput').value = liveUrl();
document.getElementById('liveSaveBtn').addEventListener('click', () => {
  let u = document.getElementById('liveUrlInput').value.trim().replace(/\/+$/, '');
  if(u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
  try{ localStorage.setItem(LIVE_KEY, u); }catch(e){}
  document.getElementById('liveUrlInput').value = liveUrl(); live.round = null; livePoll();
});
document.addEventListener('pane-shown', liveSchedule);
document.querySelectorAll('#liveTabs .tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('#liveTabs .tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active'); live.kind = tab.dataset.lk; livePoll();
}));
