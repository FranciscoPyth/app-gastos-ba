// Sondeo de fuentes de movimientos de Mercado Pago para una cuenta conectada.
//
// Objetivo: averiguar EMPÍRICAMENTE qué movimientos expone tu cuenta real
// (pagos, transferencias recibidas/enviadas, retiros y RENDIMIENTOS) en cada
// fuente disponible, para decidir la arquitectura de captura.
//
// Consulta 3 fuentes y te imprime un resumen de cada una:
//   1. /v1/payments/search            (lo que ya usamos)
//   2. /users/{id}/mercadopago_account/movements   (no documentado)
//   3. /v1/account/settlement_report  (reporte "Todas las transacciones", CSV)
//
// Uso:
//   npm run mp:probe            -> primera cuenta MP activa
//   npm run mp:probe -- 5       -> user_id 5
//   (o)  node -r ./scripts/load-local-env scripts/mp-probe.js 5
const axios = require('axios');
const db = require('../src/models');
const mp = require('../src/utils/mercadopago');

const MP_API_BASE = 'https://api.mercadopago.com';
const DAYS = parseInt(process.env.PROBE_DAYS || '30', 10);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isoDaysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();

function hr(title) { console.log(`\n${'='.repeat(60)}\n${title}\n${'='.repeat(60)}`); }

async function resolveAccount() {
  const argId = process.argv[2] ? parseInt(process.argv[2], 10) : null;
  let cuenta;
  if (argId) {
    cuenta = await db.MercadoPagoCuentas.findOne({ where: { user_id: argId } });
  } else {
    cuenta = await db.MercadoPagoCuentas.findOne({ where: { estado: 'activa' }, order: [['id', 'ASC']] });
  }
  if (!cuenta) throw new Error('No hay cuenta MP. Pasá un user_id o conectá una cuenta primero.');
  const tok = await mp.getValidAccessToken(cuenta.user_id);
  if (!tok) throw new Error(`No se pudo obtener token válido para user_id ${cuenta.user_id} (estado: ${cuenta.estado}).`);
  return { account: tok.account, token: tok.token, mpUserId: cuenta.mp_user_id };
}

// ---- 1. payments/search ----
async function probePayments(token, mpUserId) {
  hr('1) /v1/payments/search');
  try {
    const since = isoDaysAgo(DAYS);
    const res = await mp.searchPayments(token, { since, limit: 50 });
    const results = (res && res.results) || [];
    console.log(`Total devuelto (últimos ${DAYS} días): ${results.length} (paging.total=${res.paging && res.paging.total})`);

    const opTypes = {};
    const statuses = {};
    let recibidas = 0, enviadas = 0;
    for (const p of results) {
      opTypes[p.operation_type || '(null)'] = (opTypes[p.operation_type || '(null)'] || 0) + 1;
      statuses[p.status || '(null)'] = (statuses[p.status || '(null)'] || 0) + 1;
      const collector = p.collector_id || (p.collector && p.collector.id);
      const payer = p.payer && p.payer.id;
      if (String(collector) === String(mpUserId)) recibidas++;
      else if (String(payer) === String(mpUserId)) enviadas++;
    }
    console.log('operation_type:', opTypes);
    console.log('status:', statuses);
    console.log(`dirección -> recibidas(collector=vos): ${recibidas} | enviadas(payer=vos): ${enviadas}`);
    console.log('\nMuestra (hasta 8):');
    for (const p of results.slice(0, 8)) {
      console.log(`  #${p.id} | ${p.operation_type} | ${p.status} | $${p.transaction_amount} ${p.currency_id} | ${(p.description || '').slice(0, 40)} | ${p.date_approved || p.date_created}`);
    }
    if (results.some(p => p.operation_type === 'money_transfer')) {
      console.log('\n>> Hay money_transfer en payments. Revisá arriba si son recibidas o enviadas.');
    }
    console.log('\n>> RENDIMIENTOS: payments NO los incluye (no son un payment). Ver fuentes 2 y 3.');
  } catch (err) {
    console.error('ERROR payments/search:', err.response ? JSON.stringify(err.response.data) : err.message);
  }
}

// ---- 2. mercadopago_account/movements (no documentado) ----
async function probeMovements(token, mpUserId) {
  hr('2) /users/{id}/mercadopago_account/movements (no documentado)');
  try {
    const mov = await mp.getAccountMovements(token, mpUserId, { since: isoDaysAgo(DAYS) });
    if (!mov.available) {
      console.log(`NO disponible para esta cuenta (${mov.reason}). Descartar esta fuente.`);
      return;
    }
    console.log('DISPONIBLE ✓. Estructura de la respuesta:');
    const data = mov.data;
    const arr = Array.isArray(data) ? data : (data.results || data.movements || data.elements || []);
    console.log(`  keys top-level: ${Object.keys(data || {}).join(', ') || '(array directo)'}`);
    console.log(`  items: ${arr.length}`);
    const tipos = {};
    for (const m of arr) {
      const t = m.type || m.movement_type || m.concept || m.description || '(?)';
      tipos[t] = (tipos[t] || 0) + 1;
    }
    console.log('  tipos de movimiento:', tipos);
    console.log('  muestra (hasta 5):', JSON.stringify(arr.slice(0, 5), null, 2));
    console.log('\n>> Si ves un tipo tipo "investment"/"rendimiento"/"interest", ESTA es la fuente para rendimientos.');
  } catch (err) {
    console.error('ERROR movements:', err.response ? JSON.stringify(err.response.data) : err.message);
  }
}

// ---- 3. settlement_report (Todas las transacciones) ----
async function probeReport(token) {
  hr('3) /v1/account/settlement_report (Todas las transacciones, CSV)');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  try {
    // 3a. Generar un reporte para el rango
    const begin = isoDaysAgo(DAYS).split('.')[0] + 'Z';
    const end = new Date().toISOString().split('.')[0] + 'Z';
    console.log(`Generando reporte ${begin} -> ${end} ...`);
    try {
      const gen = await axios.post(`${MP_API_BASE}/v1/account/settlement_report`, { begin_date: begin, end_date: end }, { headers });
      console.log(`  POST status ${gen.status}`);
    } catch (e) {
      console.log(`  POST settlement_report falló: ${e.response ? e.response.status + ' ' + JSON.stringify(e.response.data) : e.message}`);
    }

    // 3b. Esperar a que aparezca en la lista (async)
    let file = null;
    for (let i = 0; i < 8 && !file; i++) {
      await sleep(5000);
      try {
        const list = await axios.get(`${MP_API_BASE}/v1/account/settlement_report/list`, { headers });
        const items = list.data || [];
        console.log(`  intento ${i + 1}: ${items.length} reportes en la lista`);
        if (items.length) file = (items[items.length - 1].file_name) || (items[0].file_name);
      } catch (e) {
        console.log(`  list falló: ${e.response ? e.response.status : e.message}`);
        break;
      }
    }
    if (!file) { console.log('  No se pudo obtener un archivo de reporte (puede tardar más). Reintentá luego.'); return; }

    // 3c. Descargar y analizar columnas/tipos
    console.log(`  Descargando ${file} ...`);
    const dl = await axios.get(`${MP_API_BASE}/v1/account/settlement_report/${file}`, { headers, responseType: 'text' });
    const csv = String(dl.data);
    const lines = csv.split(/\r?\n/).filter(Boolean);
    if (!lines.length) { console.log('  CSV vacío.'); return; }
    const cols = lines[0].split(/[;,]/);
    console.log(`  columnas (${cols.length}):`, cols.join(' | '));
    // Buscar columnas que describan el tipo de movimiento
    const typeIdx = cols.findIndex(c => /transaction_type|description|detail|concept|type/i.test(c));
    if (typeIdx >= 0) {
      const sep = lines[0].includes(';') ? ';' : ',';
      const vals = {};
      for (const ln of lines.slice(1)) {
        const v = ln.split(sep)[typeIdx];
        vals[v] = (vals[v] || 0) + 1;
      }
      console.log(`  valores distintos de "${cols[typeIdx]}":`, vals);
      console.log('\n>> Si ves algún valor de rendimiento/interés acá, el reporte sirve para rendimientos.');
    }
  } catch (err) {
    console.error('ERROR settlement_report:', err.response ? JSON.stringify(err.response.data) : err.message);
  }
}

async function run() {
  const { token, mpUserId } = await resolveAccount();
  console.log(`Sondeando cuenta MP mp_user_id=${mpUserId}, ventana=${DAYS} días`);
  await probePayments(token, mpUserId);
  await probeMovements(token, mpUserId);
  await probeReport(token);
  hr('FIN. Pegá esta salida acá para decidir la arquitectura.');
}

run().then(() => process.exit(0)).catch(err => { console.error('FATAL:', err.message); process.exit(1); });
