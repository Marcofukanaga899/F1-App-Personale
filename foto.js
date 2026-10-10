// ============================================================
// FOTO PILOTI — una sola funzione per tutto il sito: drvBadge(sigla, colore, testo).
// Le foto arrivano da OpenF1 (gratis, una richiesta al giorno, poi in cache sul dispositivo).
// Se una foto non c'è o non si carica, resta il cerchio col colore del team come prima.
// ============================================================
const PHOTO_KEY = 'paddock_photos_v1', PHOTO_TTL = 24 * 3600 * 1000;
const photos = {};
try{
  const c = JSON.parse(localStorage.getItem(PHOTO_KEY) || 'null');
  if(c && c.t && Date.now() - c.t < PHOTO_TTL) Object.assign(photos, c.m);
  else if(c && c.m) Object.assign(photos, c.m);   // scaduta: la uso comunque finché non arriva quella nuova
}catch(e){}

function drvBadge(code, color, label){
  const url = code && photos[code];
  return `<div class="team-badge drv${url ? ' has-photo' : ''}" data-drv="${code || ''}" style="background:${color}">` +
    (url ? `<img src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.remove('has-photo');this.remove()">` : '') +
    `<span style="color:${contrastText(color)}">${label}</span></div>`;
}
function photoSet(code, url){ if(code && url && photos[code] !== url){ photos[code] = url; clearTimeout(photoSet.t); photoSet.t = setTimeout(savePhotos, 500); applyPhotos(); } }

function applyPhotos(){
  document.querySelectorAll('.drv[data-drv]:not(.has-photo)').forEach(el => {
    const url = photos[el.dataset.drv]; if(!url || el.dataset.tried === url) return;
    el.dataset.tried = url;   // se la foto non si carica non ci riprova all'infinito
    const img = new Image(); img.alt = ''; img.referrerPolicy = 'no-referrer';
    img.onerror = () => img.remove();
    img.onload = () => { el.classList.add('has-photo'); };
    img.src = url; el.insertBefore(img, el.firstChild);
  });
}
let photoRaf = 0;
new MutationObserver(() => { if(!photoRaf) photoRaf = requestAnimationFrame(() => { photoRaf = 0; applyPhotos(); }); })
  .observe(document.body, { childList:true, subtree:true });

function savePhotos(){ try{ localStorage.setItem(PHOTO_KEY, JSON.stringify({ t:Date.now(), m:photos })); }catch(e){} }
const photoFetch = async (url, ms) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try{ const r = await fetch(url, { signal:c.signal }); if(!r.ok) throw 0; return await r.json(); } finally{ clearTimeout(t); } };

// due fonti in parallelo: OpenF1 (durante una sessione in corso può rifiutare le richieste)
// e il server live sul tuo PC (se configurato), che manda le foto insieme alla classifica
async function loadPhotos(){
  const add = (code, url) => { if(code && url){ photos[code] = url; return 1; } return 0; };
  const fromOpenF1 = async () => (await photoFetch('https://api.openf1.org/v1/drivers?session_key=latest', 8000))
    .reduce((n, d) => n + add(d.name_acronym, d.headshot_url), 0);
  const fromLive = async () => {
    const base = (localStorage.getItem('paddock_live_url') || '').trim().replace(/\/api(\/.*)?$/i, '').replace(/\/+$/, '');
    if(!base) return 0;
    const sd = await photoFetch(base + '/api/standings', 4000);
    return Object.values(sd.Lines || {}).reduce((n, l) => n + add(l.Tla, l.HeadshotUrl), 0);
  };
  const res = await Promise.allSettled([fromOpenF1(), fromLive()]);
  const got = res.reduce((n, r) => n + (r.status === 'fulfilled' ? r.value : 0), 0);
  if(got){ savePhotos(); applyPhotos(); }
  return got;
}
(async function(){
  let fresh = false;
  try{ const c = JSON.parse(localStorage.getItem(PHOTO_KEY) || 'null'); fresh = !!(c && c.t && Date.now() - c.t < PHOTO_TTL && c.m && Object.keys(c.m).length); }catch(e){}
  if(fresh){ applyPhotos(); return; }
  for(const wait of [0, 15000, 60000, 180000]){   // se all'avvio non risponde nessuna fonte, riprova
    if(wait) await new Promise(r => setTimeout(r, wait));
    if(await loadPhotos()) return;
  }
})();
