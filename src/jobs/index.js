const cron = require('node-cron');
const { runDailySummary } = require('../services/dailySummary');

const DAILY_SUMMARY_CRON = process.env.DAILY_SUMMARY_CRON || '0 21 * * *';
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
}

module.exports = { start };
