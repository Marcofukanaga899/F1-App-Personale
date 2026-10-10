// ============================================================
// SESSIONE LIVE — tabella unica: posizione, foto, gomma, distacco, ultimo giro, S1/S2/S3
// + messaggi della direzione gara (penalità, bandiere) e meteo.
// Legge lo stesso server live di "Mondiale > Live". Viola/verde = colori ufficiali del flusso F1.
// ============================================================
const lss = { timer:null };
const lv = x => x == null ? '' : (typeof x === 'object' ? (x.Value ?? '') : x);
const lcls = x => (x && typeof x === 'object') ? (x.OverallFastest ? 'lt-p' : x.PersonalFastest ? 'lt-g' : '') : '';
const lcolor = l => '#' + (l.TeamColour || 'CCCCCC');
const lname = l => liveName(l);
const lsStatus = (dot, txt) => { document.getElementById('lssStatus').innerHTML = `<span class="live-dot" style="background:${dot}"></span>${txt}`; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const arr = x => Array.isArray(x) ? x : (x && typeof x === 'object' ? Object.values(x) : []);
const sec = (s, i) => s ? (s[i] ?? s[String(i)]) : undefined;

function lsTyre(stints){
  const st = arr(stints), cur = st[st.length - 1];
  if(!cur || !cur.Compound) return '';
  const t = TYRES[String(cur.Compound).toUpperCase()] || ['?', '#CCC', '#15151E'];
  const laps = (cur.TotalLaps != null ? +cur.TotalLaps : 0) + (cur.StartLaps != null ? +cur.StartLaps : 0);
  return `<span class="tyre" style="background:${t[1]};color:${t[2]}">${t[0]}${laps ? `<small>${laps}</small>` : ''}</span>`;
}
function lsAvatar(l, c){
  if(l.HeadshotUrl) photoSet(l.Tla, l.HeadshotUrl);   // la foto del flusso live vale come quella di OpenF1
  return drvBadge(l.Tla, c, esc(l.Tla));
}
function lsRowHTML(l, i, isRace, tyres){
  const pos = +l.Position || i + 1, c = lcolor(l), out = l.Retired || l.Stopped;
  const main = out ? 'RIT' : isRace ? (pos === 1 ? 'Leader' : lv(l.GapToLeader) || '—') : (lv(l.BestLapTime) || '—');
  const sub = out ? '' : isRace ? (pos > 1 ? 'int ' + (lv(l.IntervalToPositionAhead) || '—') : '') + (l.InPit ? ' · BOX' : '') : (l.InPit ? 'BOX' : '');
  const s = l.Sectors, last = l.LastLapTime;
  const cells = [0,1,2].map(k => { const v = sec(s, k); return `<div><div class="q-label">S${k + 1}</div><div class="q-time mono ${lcls(v)}">${lv(v) || '—'}</div></div>`; }).join('');
  return `<div class="quali-card"${out ? ' style="opacity:.55"' : ''}>
    <div class="quali-head">${posBadgeHTML(pos)}${lsAvatar(l, c)}
      <div class="rank-info"><div class="rank-name">${esc(lname(l))}</div><div class="rank-team">${esc(titleCase(l.TeamName))}</div></div>
      <div class="rank-right"><div class="rank-pts mono" style="font-size:15px">${esc(main)}</div><div class="rank-gap">${esc(sub)}</div></div></div>
    <div class="quali-times ls-times">${tyres ? `<div><div class="q-label">Gomma</div>${lsTyre(tyres.Lines?.[l._n || l.RacingNumber]?.Stints) || '<span class="mono">—</span>'}</div>` : ''}
      <div><div class="q-label">Ultimo</div><div class="q-time mono ${lcls(last)}">${lv(last) || '—'}</div></div>${cells}
      ${!isRace && lv(l.BestLapTime) ? `<div><div class="q-label">Migliore</div><div class="q-time mono ${lcls(l.BestLapTime)}">${esc(lv(l.BestLapTime))}</div></div>` : ''}</div></div>`;
}
function lsRCHTML(rc){
  const msgs = arr(rc).filter(m => m && m.Message).sort((a, b) => String(b.Utc).localeCompare(String(a.Utc))).slice(0, 8);
  if(!msgs.length) return '';
  const FLAG = { RED:'#E10600', YELLOW:'#F5C400', 'DOUBLE YELLOW':'#F5C400', GREEN:'#1CB854', CLEAR:'#1CB854', BLUE:'#0A7EC2', CHEQUERED:'#15151E', 'BLACK AND WHITE':'#15151E' };
  return `<div class="rc-box"><div class="rc-title">Direzione gara</div>` + msgs.map(m => {
    const f = String(m.Flag || '').toUpperCase(), col = FLAG[f] || (m.Category === 'SafetyCar' ? '#F5A623' : 'var(--border)');
    const warn = /PENALTY|INVESTIGAT|NOTED|DELETED|DISQUALIF|UNSAFE|WARNING/i.test(m.Message);
    let t = ''; if(m.Utc){ const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(m.Utc) ? m.Utc : m.Utc + 'Z'); if(!isNaN(d)) t = d.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' }); }
    return `<div class="rc-row${warn ? ' rc-warn' : ''}" style="border-left-color:${col}"><span class="rc-meta mono">${t}${m.Lap ? ' · G' + esc(m.Lap) : ''}</span><span>${esc(m.Message)}</span></div>`;
  }).join('') + '</div>';
}
function lsWeatherHTML(w){
  if(!w || (w.TrackTemp == null && w.AirTemp == null)) return '';
  const chip = (lab, v, u) => v == null || v === '' ? '' : `<div class="wx-chip"><span class="q-label">${lab}</span><b class="mono">${esc(v)}${u}</b></div>`;
  const rain = w.Rainfall != null && +w.Rainfall > 0;
  return `<div class="wx-row">${chip('Pista', w.TrackTemp, '°')}${chip('Aria', w.AirTemp, '°')}${chip('Umidità', w.Humidity, '%')}${chip('Vento', w.WindSpeed, ' m/s')}${rain ? '<div class="wx-chip"><b style="color:#0A7EC2">PIOGGIA</b></div>' : ''}</div>`;
}

async function lsPoll(){
  const el = document.getElementById('lssList');
  if(!liveUrl()){ lsStatus('#B0B0B8', 'Server non configurato'); el.innerHTML = emptyState('Imposta prima l\'indirizzo del server in Mondiale, tab Live.'); return; }
  try{
    const [sess, lc, sd] = await Promise.all([liveGet('/api/session'), liveGet('/api/lap-count'), liveGet('/api/standings')]);
    // dati opzionali: se uno manca, la tabella funziona lo stesso
    const [ty, rc, wx] = (await Promise.allSettled([liveGet('/api/tyres'), liveGet('/api/race-control'), liveGet('/api/weather')])).map(r => r.status === 'fulfilled' ? r.value : null);
    const rows = (sd.Leaderboard || []).map(n => sd.Lines[n] && Object.assign({ _n:String(n) }, sd.Lines[n])).filter(l => l && l.Tla);
    document.getElementById('lssRC').innerHTML = lsRCHTML(rc && rc.RaceControl);
    document.getElementById('lssWx').innerHTML = lsWeatherHTML(wx && wx.Weather);
    if(!rows.length){ lsStatus('#F5A623', 'Server collegato, nessuna sessione in corso'); el.innerHTML = emptyState('I dati compaiono quando inizia una sessione.'); return; }
    const type = sess.Session?.Type || '', lap = lc.LapCount || {};
    const isRace = /race|sprint/i.test(type) && !/qualif/i.test(type);
    lsStatus('#1CB854', `LIVE · ${esc(sess.Session?.Name || type || 'Sessione')}${lap.CurrentLap ? ` · giro ${lap.CurrentLap}/${lap.TotalLaps || '—'}` : ''}`);
    el.innerHTML = rows.map((l, i) => lsRowHTML(l, i, isRace, ty)).join('');
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
