// ============================================================
// SESSIONE LIVE — classifica in pista + settori di tutti i piloti
// (prove, qualifiche, Sprint e gara). Legge lo stesso server live di "Mondiale LIVE".
// I colori viola/verde sono quelli ufficiali del flusso F1 (OverallFastest / PersonalFastest).
// ============================================================
const lss = { kind:'order', timer:null };
const lv = x => x == null ? '' : (typeof x === 'object' ? (x.Value ?? '') : x);
const lcls = x => (x && typeof x === 'object') ? (x.OverallFastest ? 'p' : x.PersonalFastest ? 'g' : 'n') : 'n';
const lcell = x => `<span class="mono lt-${lcls(x)}">${lv(x) || '—'}</span>`;
const lcolor = l => '#' + (l.TeamColour || 'CCCCCC');
const lname = l => liveName(l);
const lsStatus = (dot, txt) => { document.getElementById('lssStatus').innerHTML = `<span class="live-dot" style="background:${dot}"></span>${txt}`; };

function lsOrderHTML(rows, isRace){
  return rows.map((l, i) => {
    const pos = +l.Position || i + 1, c = lcolor(l), out = l.Retired;
    const main = out ? 'RIT' : isRace ? (pos === 1 ? 'Leader' : lv(l.GapToLeader) || '—') : (lv(l.BestLapTime) || '—');
    const sub = out ? '' : isRace ? (pos > 1 ? 'int ' + (lv(l.IntervalToPositionAhead) || '—') : '') + (l.InPit ? ' · BOX' : '') : 'ultimo ' + (lv(l.LastLapTime) || '—');
    return `<div class="rank-row"${out ? ' style="opacity:.55"' : ''}>${posBadgeHTML(pos)}
      <div class="team-badge" style="background:${c}"><span style="color:${contrastText(c)}">${l.Tla}</span></div>
      <div class="rank-info"><div class="rank-name">${lname(l)}</div><div class="rank-team">${titleCase(l.TeamName)}</div></div>
      <div class="rank-right"><div class="rank-pts mono" style="font-size:15px">${main}</div><div class="rank-gap">${sub}</div></div></div>`;
  }).join('');
}
function lsSectorsHTML(rows){
  const head = '<div class="lt-row lt-head"><span>Pil.</span><span></span><span>S1</span><span>S2</span><span>S3</span><span>Ultimo</span></div>';
  return `<div class="lap-table" style="border-radius:8px">${head}` + rows.map(l => {
    const s = l.Sectors || {};
    return `<div class="lt-row"><span class="mono" style="font-weight:700">${l.Tla}</span>
      <span style="width:10px;height:10px;border-radius:50%;display:inline-block;background:${lcolor(l)}"></span>
      ${lcell(s[0] ?? s['0'])}${lcell(s[1] ?? s['1'])}${lcell(s[2] ?? s['2'])}${lcell(l.LastLapTime)}</div>`;
  }).join('') + '</div>';
}

async function lsPoll(){
  const el = document.getElementById('lssList');
  if(!liveUrl()){ lsStatus('#B0B0B8', 'Server non configurato'); el.innerHTML = emptyState('Imposta prima l\'indirizzo del server in Mondiale, tab Live.'); return; }
  try{
    const [sess, lc, sd] = await Promise.all([liveGet('/api/session'), liveGet('/api/lap-count'), liveGet('/api/standings')]);
    const rows = (sd.Leaderboard || []).map(n => sd.Lines[n]).filter(l => l && l.Tla);
    if(!rows.length){ lsStatus('#F5A623', 'Server collegato, nessuna sessione in corso'); el.innerHTML = emptyState('I dati compaiono quando inizia una sessione.'); return; }
    const type = sess.Session?.Type || '', lap = lc.LapCount || {};
    const isRace = /race|sprint/i.test(type) && !/qualif/i.test(type);
    lsStatus('#1CB854', `LIVE · ${sess.Session?.Name || type || 'Sessione'}${lap.CurrentLap ? ` · giro ${lap.CurrentLap}/${lap.TotalLaps || '—'}` : ''}`);
    el.innerHTML = lss.kind === 'order' ? lsOrderHTML(rows, isRace) : lsSectorsHTML(rows);
    recalcAccordionHeight('acc-sessione');
  } catch(err){
    lsStatus('#E10600', 'Server non raggiungibile');
    el.innerHTML = emptyState('Controlla che il PC e il server siano accesi e che Tailscale sia attivo sul telefono.');
  }
}
function lsSchedule(){
  const on = paneActive('pane-lss');
  if(on && !lss.timer){ lsPoll(); lss.timer = setInterval(() => { if(!document.hidden) lsPoll(); }, 4000); }
  else if(!on && lss.timer){ clearInterval(lss.timer); lss.timer = null; }
}
document.addEventListener('pane-shown', lsSchedule);
document.querySelectorAll('#lssTabs .tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('#lssTabs .tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active'); lss.kind = tab.dataset.sk; lsPoll();
}));
