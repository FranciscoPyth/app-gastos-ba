const cron = require('node-cron');
const { runDailySummary } = require('../services/dailySummary');
const { runConciliacionReminder } = require('../services/conciliacionReminder');
const { syncAll } = require('../utils/mpSync');
const { runRecordatoriosPuntuales, runResumenDiarioAgenda } = require('../services/secretario');

// Secretario / agenda: avisos puntuales (cada 10 min) y resumen diario (8:00 ART).
const AGENDA_PUNTUAL_CRON = '*/10 * * * *';
const AGENDA_DIGEST_CRON = process.env.AGENDA_DIGEST_CRON || '0 8 * * *';

const DAILY_SUMMARY_CRON = process.env.DAILY_SUMMARY_CRON || '0 21 * * *';
// Tick interno cada hora; el envío real se decide por usuario según Usuarios.hora_conciliacion.
const CONCILIACION_TICK_CRON = '0 * * * *';
// Polling de Mercado Pago — captura los gastos (que el webhook no puede notificar).
// Default cada 10 min. El webhook cubre los ingresos en tiempo real.
const MP_SYNC_CRON = process.env.MP_SYNC_CRON || '*/10 * * * *';
const TZ = process.env.CRON_TZ || 'America/Argentina/Buenos_Aires';

let mpSyncRunning = false;

function start() {
  if (process.env.DISABLE_CRON === 'true') {
    console.log('[jobs] Cron deshabilitado por DISABLE_CRON=true');
    return;
  }
  cron.schedule(DAILY_SUMMARY_CRON, () => {
    runDailySummary().catch(err => console.error('[jobs] runDailySummary error:', err));
  }, { timezone: TZ });
  console.log(`[jobs] Cron resumen diario programado: "${DAILY_SUMMARY_CRON}" TZ=${TZ}`);

  // Recordatorio de conciliación DESACTIVADO (2026-09-04): el aviso diario de las 22h
  // dejó de ser útil. Se deja el código por si se quiere reactivar.
  // cron.schedule(CONCILIACION_TICK_CRON, () => {
  //   runConciliacionReminder().catch(err => console.error('[jobs] runConciliacionReminder error:', err));
  // }, { timezone: TZ });
  // console.log(`[jobs] Cron conciliación (tick horario): "${CONCILIACION_TICK_CRON}" TZ=${TZ}`);

  // Polling MP en el mismo proceso (reemplaza scripts/mp-sync-worker.js).
  // Guard de solapamiento por si un sync tarda más que el intervalo.
  cron.schedule(MP_SYNC_CRON, async () => {
    if (mpSyncRunning) { console.log('[jobs] mp sync anterior en curso, salteo este tick'); return; }
    mpSyncRunning = true;
    try {
      const s = await syncAll();
      console.log(`[jobs] mp sync ok | total=${s.total} ok=${s.ok} fail=${s.fail}`);
    } catch (err) {
      console.error('[jobs] mp sync error:', err.message);
    } finally {
      mpSyncRunning = false;
    }
  }, { timezone: TZ });
  console.log(`[jobs] Cron MP sync (polling): "${MP_SYNC_CRON}" TZ=${TZ}`);

  cron.schedule(AGENDA_PUNTUAL_CRON, () => {
    runRecordatoriosPuntuales().catch(err => console.error('[jobs] recordatorios puntuales error:', err.message));
  }, { timezone: TZ });
  console.log(`[jobs] Cron agenda puntual: "${AGENDA_PUNTUAL_CRON}" TZ=${TZ}`);

  cron.schedule(AGENDA_DIGEST_CRON, () => {
    runResumenDiarioAgenda().catch(err => console.error('[jobs] resumen agenda error:', err.message));
  }, { timezone: TZ });
  console.log(`[jobs] Cron agenda resumen: "${AGENDA_DIGEST_CRON}" TZ=${TZ}`);
}

module.exports = { start };
