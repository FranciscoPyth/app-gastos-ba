// Worker que sincroniza Mercado Pago cada N minutos para TODOS los usuarios
// con cuenta activa.
//
// Uso local:  npm run mp:worker
// Uso prod:   pm2 start scripts/mp-sync-worker.js --name mp-sync
//
// Intervalo configurable con env MP_SYNC_INTERVAL_MIN (default 5).
const { syncAll } = require('../src/utils/mpSync');

const intervalMin = parseInt(process.env.MP_SYNC_INTERVAL_MIN || '5', 10);
const intervalMs = intervalMin * 60 * 1000;

async function run() {
    const start = Date.now();
    try {
        const summary = await syncAll();
        const took = Date.now() - start;
        console.log(`[mp-worker] ${new Date().toISOString()} | sync OK | total=${summary.total} ok=${summary.ok} fail=${summary.fail} | ${took}ms`);
        if (summary.details.length) {
            summary.details.forEach(d => console.log(`  user=${d.user_id} created=${d.created || 0} skipped=${d.skipped || 0} errors=${d.errors || 0} reason=${d.reason || ''}`));
        }
    } catch (err) {
        console.error('[mp-worker] error:', err.message);
    }
}

console.log(`[mp-worker] arrancando — intervalo ${intervalMin} min`);
run();
setInterval(run, intervalMs);
