// netlify/functions/unsubscribe.js
const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { endpoint } = JSON.parse(event.body);
    if (!endpoint) return { statusCode: 400, body: 'endpoint mancante' };
    const id = crypto.createHash('sha256').update(endpoint).digest('hex');
    const store = getStore('push-subscriptions');
    await store.delete(id);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: 'Errore: ' + err.message };
  }
};
