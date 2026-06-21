const cron = require('node-cron');
const { runDailySummary } = require('../services/dailySummary');
const { runConciliacionReminder } = require('../services/conciliacionReminder');

const DAILY_SUMMARY_CRON = process.env.DAILY_SUMMARY_CRON || '0 21 * * *';
// Tick interno cada hora; el envío real se decide por usuario según Usuarios.hora_conciliacion.
const CONCILIACION_TICK_CRON = '0 * * * *';
const TZ = process.env.CRON_TZ || 'America/Argentina/Buenos_Aires';

function start() {
  if (process.env.DISABLE_CRON === 'true') {
    console.log('[jobs] Cron deshabilitado por DISABLE_CRON=true');
    return;
  }
  cron.schedule(DAILY_SUMMARY_CRON, () => {
    runDailySummary().catch(err => console.error('[jobs] runDailySummary error:', err));
  }, { timezone: TZ });
  console.log(`[jobs] Cron resumen diario programado: "${DAILY_SUMMARY_CRON}" TZ=${TZ}`);

  cron.schedule(CONCILIACION_TICK_CRON, () => {
    runConciliacionReminder().catch(err => console.error('[jobs] runConciliacionReminder error:', err));
  }, { timezone: TZ });
  console.log(`[jobs] Cron conciliación (tick horario): "${CONCILIACION_TICK_CRON}" TZ=${TZ}`);
}

module.exports = { start };
