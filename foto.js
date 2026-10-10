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
function photoSet(code, url){ if(code && url && photos[code] !== url){ photos[code] = url; applyPhotos(); } }

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

(async function loadPhotos(){
  try{
    const c = JSON.parse(localStorage.getItem(PHOTO_KEY) || 'null');
    if(c && c.t && Date.now() - c.t < PHOTO_TTL) { applyPhotos(); return; }
  }catch(e){}
  try{
    const r = await fetch('https://api.openf1.org/v1/drivers?session_key=latest');
    if(!r.ok) throw 0;
    const list = await r.json(), m = {};
    list.forEach(d => { if(d.name_acronym && d.headshot_url) m[d.name_acronym] = d.headshot_url; });
    if(!Object.keys(m).length) throw 0;
    Object.assign(photos, m);
    try{ localStorage.setItem(PHOTO_KEY, JSON.stringify({ t:Date.now(), m:photos })); }catch(e){}
    applyPhotos();
  }catch(e){}
})();
