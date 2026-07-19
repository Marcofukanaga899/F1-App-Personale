// netlify/functions/subscribe.js
// Riceve la "PushSubscription" creata dal browser e la salva.
// Ogni sottoscrizione viene identificata da un hash del suo endpoint,
// così iscriversi due volte dallo stesso dispositivo sovrascrive senza duplicare.

const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const subscription = JSON.parse(event.body);
    if (!subscription || !subscription.endpoint) {
      return { statusCode: 400, body: 'Sottoscrizione non valida' };
    }
    const id = crypto.createHash('sha256').update(subscription.endpoint).digest('hex');
    const store = getStore('push-subscriptions');
    await store.setJSON(id, subscription);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: 'Errore: ' + err.message };
  }
};
