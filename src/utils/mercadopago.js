// Cliente HTTP de Mercado Pago: OAuth + lectura de pagos / movimientos.
//
// Notas de alcance (Argentina):
//   - /v1/payments/search funciona consistentemente para cobros recibidos
//     (cuentas merchant y personales habilitadas).
//   - /users/{id}/mercadopago_account/movements existe pero es no documentado
//     y no está garantizado para todas las cuentas personales. Lo intentamos
//     con manejo de fallback: si responde 401/403/404, la marcamos como no
//     disponible y solo seguimos con payments.
const axios = require('axios');
const db = require('../models');
const { encrypt, decrypt } = require('./crypto');

const MP_API_BASE = 'https://api.mercadopago.com';
const MP_OAUTH_BASE = 'https://auth.mercadopago.com.ar';

function getConfig() {
    return {
        clientId: process.env.MP_CLIENT_ID,
        clientSecret: process.env.MP_CLIENT_SECRET,
        redirectUri: process.env.MP_REDIRECT_URI || 'http://localhost:4000/api/mercadopago/callback'
    };
}

function assertConfigured() {
    const cfg = getConfig();
    if (!cfg.clientId || !cfg.clientSecret) {
        throw new Error('MP no configurado: faltan MP_CLIENT_ID / MP_CLIENT_SECRET en .env');
    }
}

// ---------------- OAuth ----------------

// URL para que el usuario autorice nuestra app.
// state: opaque token para correlacionar callback con el usuario actual.
function buildAuthUrl(state) {
    assertConfigured();
    const { clientId, redirectUri } = getConfig();
    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        platform_id: 'mp',
        redirect_uri: redirectUri,
        state: state || ''
    });
    return `${MP_OAUTH_BASE}/authorization?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
    assertConfigured();
    const { clientId, clientSecret, redirectUri } = getConfig();
    const { data } = await axios.post(`${MP_API_BASE}/oauth/token`, {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
    });
    return data;
}

async function refreshToken(refreshTokenPlain) {
    assertConfigured();
    const { clientId, clientSecret } = getConfig();
    const { data } = await axios.post(`${MP_API_BASE}/oauth/token`, {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshTokenPlain
    });
    return data;
}

// ---------------- Persistencia ----------------

async function saveAccount(userId, tokenData) {
    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 21600) * 1000);
    const payload = {
        user_id: userId,
        mp_user_id: String(tokenData.user_id),
        access_token: encrypt(tokenData.access_token),
        refresh_token: encrypt(tokenData.refresh_token),
        expires_at: expiresAt,
        scope: tokenData.scope || '',
        estado: 'activa'
    };

    const existing = await db.MercadoPagoCuentas.findOne({ where: { user_id: userId } });
    if (existing) {
        await existing.update(payload);
        return existing;
    }
    return db.MercadoPagoCuentas.create(payload);
}

async function getValidAccessToken(userId) {
    const cuenta = await db.MercadoPagoCuentas.findOne({ where: { user_id: userId } });
    if (!cuenta) return null;
    if (cuenta.estado !== 'activa') return null;

    // Renovar si vence en menos de 5 min
    const ttl = new Date(cuenta.expires_at).getTime() - Date.now();
    if (ttl < 5 * 60 * 1000) {
        try {
            const refreshed = await refreshToken(decrypt(cuenta.refresh_token));
            await cuenta.update({
                access_token: encrypt(refreshed.access_token),
                refresh_token: encrypt(refreshed.refresh_token),
                expires_at: new Date(Date.now() + (refreshed.expires_in || 21600) * 1000)
            });
            return { account: cuenta, token: refreshed.access_token };
        } catch (err) {
            await cuenta.update({ estado: 'expirada' });
            return null;
        }
    }

    return { account: cuenta, token: decrypt(cuenta.access_token) };
}

// ---------------- API calls ----------------

async function searchPayments(accessToken, { since, limit = 50, offset = 0 } = {}) {
    const params = {
        sort: 'date_created',
        criteria: 'desc',
        limit,
        offset
    };
    if (since) params['range'] = 'date_created', params['begin_date'] = since, params['end_date'] = 'NOW';

    const { data } = await axios.get(`${MP_API_BASE}/v1/payments/search`, {
        params,
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    return data;
}

// Endpoint no documentado oficialmente — puede no estar disponible para cuentas personales.
// Si responde 401/403/404 lo tratamos como "no disponible".
async function getAccountMovements(accessToken, mpUserId, { since } = {}) {
    try {
        const url = `${MP_API_BASE}/users/${mpUserId}/mercadopago_account/movements`;
        const { data } = await axios.get(url, {
            params: since ? { begin_date: since } : {},
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        return { available: true, data };
    } catch (err) {
        const status = err.response && err.response.status;
        if ([401, 403, 404].includes(status)) {
            return { available: false, reason: `HTTP ${status}` };
        }
        throw err;
    }
}

module.exports = {
    buildAuthUrl,
    exchangeCodeForToken,
    refreshToken,
    saveAccount,
    getValidAccessToken,
    searchPayments,
    getAccountMovements,
    isConfigured: () => {
        const cfg = getConfig();
        return !!(cfg.clientId && cfg.clientSecret);
    }
};
