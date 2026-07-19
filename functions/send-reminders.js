// netlify/functions/send-reminders.js
// Eseguita ogni 5 minuti da Netlify (vedi netlify.toml). Controlla il
// prossimo weekend di gara, e se una sessione inizia tra 10 e 20 minuti manda
// una notifica push a tutti i dispositivi iscritti. Una volta mandata per
// una sessione, la segna come "già notificata" per non rimandarla di nuovo.

const webpush = require('web-push');
const { getStore } = require('@netlify/blobs');

const API_BASE = 'https://api.jolpi.ca/ergast/f1';

function buildSessions(race) {
  const sessions = [];
  const d = (obj) => (obj && obj.date && obj.time) ? new Date(obj.date + 'T' + obj.time) : null;
  const add = (key, label, obj) => { const dt = d(obj); if (dt) sessions.push({ key, label, dt }); };
  add('fp1', 'Prove Libere 1', race.FirstPractice);
  add('fp2', 'Prove Libere 2', race.SecondPractice);
  add('fp3', 'Prove Libere 3', race.ThirdPractice);
  add('sprintquali', 'Qualifiche Sprint', race.SprintQualifying);
  add('sprint', 'Sprint', race.Sprint);
  add('quali', 'Qualifiche', race.Qualifying);
  add('race', 'Gara', (race.date && race.time) ? { date: race.date, time: race.time } : null);
  return sessions;
}

exports.handler = async () => {
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const contact = process.env.VAPID_CONTACT || 'mailto:example@example.com';

  if (!vapidPublic || !vapidPrivate) {
    console.error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY non configurate come variabili d\'ambiente su Netlify');
    return { statusCode: 200, body: 'VAPID non configurate, salto questo giro' };
  }
  webpush.setVapidDetails(contact, vapidPublic, vapidPrivate);

  const notifiedStore = getStore('notified-sessions');
  const subsStore = getStore('push-subscriptions');

  try {
    const res = await fetch(`${API_BASE}/current/next.json`);
    const data = await res.json();
    const race = data.MRData.RaceTable.Races[0];
    if (!race) return { statusCode: 200, body: 'Nessuna gara imminente' };

    const sessions = buildSessions(race);
    const now = new Date();

    for (const s of sessions) {
      const minutesUntil = (s.dt - now) / 60000;
      if (minutesUntil < 10 || minutesUntil > 20) continue; // fuori dalla finestra dei 15 min

      const notifyKey = `${race.season}-${race.round}-${s.key}`;
      const already = await notifiedStore.get(notifyKey);
      if (already) continue; // già avvisati per questa sessione

      // manda la notifica a tutti i dispositivi iscritti
      const { blobs } = await subsStore.list();
      const payload = JSON.stringify({
        title: `Tra 15 min: ${s.label}`,
        body: `${race.raceName} — ${race.Circuit.circuitName}`
      });

      await Promise.all(blobs.map(async (b) => {
        const sub = await subsStore.get(b.key, { type: 'json' });
        if (!sub) return;
        try {
          await webpush.sendNotification(sub, payload);
        } catch (err) {
          // 410/404 = iscrizione scaduta o revocata dall'utente: la rimuoviamo
          if (err.statusCode === 410 || err.statusCode === 404) {
            await subsStore.delete(b.key);
          }
        }
      }));

      // segna come notificata (una manciata di byte per sessione, ~110 in tutta
      // la stagione: trascurabile, non serve nessuna pulizia)
      await notifiedStore.setJSON(notifyKey, { sentAt: now.toISOString() });
    }

    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: 'Errore: ' + err.message };
  }
};
