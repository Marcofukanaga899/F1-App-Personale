// ============================================================
// TAB INTERNE — gestisce le tab dentro "Sessione" e "Mondiale".
// paneActive(id): vero solo se la tab è selezionata E la sezione è aperta.
// Le sezioni che fanno polling o caricamenti pesanti ascoltano l'evento 'pane-shown'.
// ============================================================
function paneActive(id){
  const p = document.getElementById(id);
  return !!(p && p.classList.contains('active') && p.closest('.accordion-item.open'));
}
function notifyPanes(){ document.dispatchEvent(new CustomEvent('pane-shown')); }

document.querySelectorAll('.main-tabs').forEach(group => {
  const body = group.closest('.accordion-body');
  group.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    const id = tab.dataset.pane;
    group.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
    group.parentElement.querySelectorAll(':scope > .pane').forEach(p => p.classList.toggle('active', p.id === id));
    if(typeof recalcAccordionHeight === 'function' && body) recalcAccordionHeight(body.id);
    notifyPanes();
  }));
});
// aprire o chiudere una sezione cambia quali tab sono "visibili"
document.querySelectorAll('.accordion-header').forEach(h => h.addEventListener('click', () => setTimeout(notifyPanes, 0)));
