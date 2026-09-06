// Google Calendar (solo lectura) — OAuth code flow + consulta de eventos vía REST.
// Tokens cifrados por usuario (mismo patrón que Mercado Pago).
const axios = require('axios');
const jwt = require('jsonwebtoken');
const db = require('../models');
const { encrypt, decrypt } = require('../utils/crypto');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

// Cliente dedicado para calendario (independiente del login de Google). Fallback al de login.
function clientId() { return process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID; }
function clientSecret() { return process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET; }
function redirectUri() { return process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'https://controlalo.com.ar/api/gcal/callback'; }
function isConfigured() { return !!(clientId() && clientSecret()); }

function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri(),
    grant_type: 'authorization_code'
  });
  const r = await axios.post(TOKEN_URL, body.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  return r.data; // { access_token, expires_in, refresh_token, scope, id_token, ... }
}

async function saveAccount(userId, tokenData) {
  let email = null;
  try { if (tokenData.id_token) email = (jwt.decode(tokenData.id_token) || {}).email || null; } catch (_) {}
  const expiry = new Date(Date.now() + (Number(tokenData.expires_in || 3500) * 1000));
  const existing = await db.GoogleCalendarCuentas.findByPk(userId);
  const payload = {
    user_id: userId,
    // Google solo devuelve refresh_token en el primer consentimiento; conservá el previo si no vino.
    refresh_token: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : (existing ? existing.refresh_token : null),
    access_token: encrypt(tokenData.access_token),
    token_expiry: expiry,
    google_email: email || (existing ? existing.google_email : null),
    scope: tokenData.scope || SCOPE,
    created_at: existing ? existing.created_at : new Date()
  };
  if (!payload.refresh_token) throw new Error('No se recibió refresh_token (revocá el acceso y reconectá con prompt=consent).');
  if (existing) await existing.update(payload); else await db.GoogleCalendarCuentas.create(payload);
  return payload;
}

async function refreshAccess(cuenta) {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: decrypt(cuenta.refresh_token),
    grant_type: 'refresh_token'
  });
  const r = await axios.post(TOKEN_URL, body.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  const expiry = new Date(Date.now() + (Number(r.data.expires_in || 3500) * 1000));
  await cuenta.update({ access_token: encrypt(r.data.access_token), token_expiry: expiry });
  return r.data.access_token;
}

async function getValidAccessToken(userId) {
  const cuenta = await db.GoogleCalendarCuentas.findByPk(userId);
  if (!cuenta) return null;
  const margen = 60 * 1000;
  if (cuenta.access_token && cuenta.token_expiry && new Date(cuenta.token_expiry).getTime() - margen > Date.now()) {
    return decrypt(cuenta.access_token);
  }
  return await refreshAccess(cuenta);
}

// Lista eventos de TODOS los calendarios del usuario en el rango [desde, hasta] (YYYY-MM-DD, ART).
async function listEvents(userId, { desde, hasta }) {
  const token = await getValidAccessToken(userId);
  if (!token) return { no_conectado: true };
  const headers = { Authorization: `Bearer ${token}` };
  const timeMin = `${desde}T00:00:00-03:00`;
  const timeMax = `${hasta}T23:59:59-03:00`;

  const calRes = await axios.get('https://www.googleapis.com/calendar/v3/users/me/calendarList', { headers });
  const calendarios = (calRes.data.items || []).filter(c => c.selected !== false);

  const eventos = [];
  for (const cal of calendarios) {
    try {
      const evRes = await axios.get(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events`,
        { headers, params: { timeMin, timeMax, singleEvents: true, orderBy: 'startTime', maxResults: 50 } }
      );
      for (const ev of (evRes.data.items || [])) {
        if (ev.status === 'cancelled') continue;
        const todoElDia = !!(ev.start && ev.start.date && !ev.start.dateTime);
        eventos.push({
          titulo: ev.summary || '(sin título)',
          inicio: ev.start ? (ev.start.dateTime || ev.start.date) : null,
          fin: ev.end ? (ev.end.dateTime || ev.end.date) : null,
          todo_el_dia: todoElDia,
          calendario: cal.summaryOverride || cal.summary || ''
        });
      }
    } catch (e) {
      console.error(`[gcal] error leyendo calendario ${cal.id}:`, e.response?.data?.error?.message || e.message);
    }
  }
  eventos.sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
  return { eventos };
}

module.exports = { isConfigured, buildAuthUrl, exchangeCodeForToken, saveAccount, getValidAccessToken, listEvents };
