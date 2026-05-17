// Sincronización de movimientos de Mercado Pago hacia GastosPruebaN8N.
//
// Para cada usuario con cuenta MP activa:
//   1. Trae payments desde last_sync_at (via /v1/payments/search).
//   2. Intenta también /users/{id}/mercadopago_account/movements (no garantizado).
//   3. Por cada item: deduplica via MercadoPagoEventos, crea registro espejo
//      en GastosPruebaN8N, marca el evento como procesado.
//   4. Actualiza last_sync_at.
const db = require('../models');
const mp = require('./mercadopago');
const { normalizarTelefono } = require('./phoneUtils');

function mapPaymentToGasto(payment, mpUserId, userPhone) {
    // Si el usuario es el cobrador (collector), es ingreso.
    // Si es el pagador (payer), es gasto.
    const collectorId = payment.collector_id || (payment.collector && payment.collector.id);
    const payerId = payment.payer && payment.payer.id;
    const isIncome = String(collectorId) === String(mpUserId);
    const isExpense = String(payerId) === String(mpUserId);

    // Si no podemos determinar, asumimos gasto (más conservador).
    const tipo = isIncome ? 'Ingreso' : (isExpense ? 'Gasto' : 'Gasto');

    const monto = parseFloat(payment.transaction_amount || 0);
    const divisa = (payment.currency_id || 'ARS').toUpperCase();

    let descripcion = payment.description || '';
    if (!descripcion && payment.additional_info && Array.isArray(payment.additional_info.items)) {
        descripcion = payment.additional_info.items.map(i => i.title).filter(Boolean).join(', ');
    }
    if (!descripcion) {
        descripcion = isIncome
            ? `Cobro MP de ${payment.payer && (payment.payer.email || payment.payer.first_name) || 'desconocido'}`
            : `Pago MP a ${payment.point_of_interaction && payment.point_of_interaction.transaction_data && payment.point_of_interaction.transaction_data.merchant_id || payment.description || 'desconocido'}`;
    }

    const fecha = (payment.date_approved || payment.date_created || new Date().toISOString()).split('T')[0];

    return {
        numero_cel: userPhone || '0000000000',
        descripcion: descripcion.substring(0, 250),
        monto,
        fecha,
        divisa,
        tipos_transaccion: tipo,
        metodo_pago: 'Mercado Pago',
        categoria: isIncome ? 'Cobros MP' : 'Pagos MP'
    };
}

async function syncOne(userId, { force = false } = {}) {
    const result = await mp.getValidAccessToken(userId);
    if (!result) return { ok: false, reason: 'no_account_or_expired' };
    const { account, token } = result;

    const user = await db.Usuarios.findByPk(userId);
    const userPhone = user && user.telefono ? normalizarTelefono(user.telefono) : null;

    const since = force ? null : (account.last_sync_at ? new Date(account.last_sync_at).toISOString() : null);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    // ---- Payments ----
    try {
        const paymentsRes = await mp.searchPayments(token, { since, limit: 50 });
        const results = (paymentsRes && paymentsRes.results) || [];

        for (const payment of results) {
            const resourceId = String(payment.id);
            const existing = await db.MercadoPagoEventos.findOne({ where: { mp_resource_id: resourceId } });
            if (existing) { skipped++; continue; }

            const t = await db.sequelize.transaction();
            try {
                const evento = await db.MercadoPagoEventos.create({
                    user_id: userId,
                    mp_resource_id: resourceId,
                    mp_resource_type: 'payment',
                    origen: 'polling',
                    raw_payload: payment,
                    procesado: false
                }, { transaction: t });

                const gastoData = mapPaymentToGasto(payment, account.mp_user_id, userPhone);
                const gasto = await db.GastosPruebaN8N.create(gastoData, { transaction: t });

                await evento.update({ procesado: true, gasto_id: gasto.id }, { transaction: t });
                await t.commit();
                created++;
            } catch (err) {
                await t.rollback();
                errors++;
                console.error(`[mpSync] error procesando payment ${resourceId}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[mpSync] payments search falló:', err.response ? err.response.data : err.message);
    }

    // ---- Movements (best-effort) ----
    try {
        const mov = await mp.getAccountMovements(token, account.mp_user_id, { since });
        if (!mov.available) {
            console.log(`[mpSync] account/movements no disponible (${mov.reason}). Se omite — sólo payments.`);
        }
        // Si quedó disponible, en una iteración futura podemos parsear mov.data
        // y crear registros similares. Por ahora documentamos y seguimos sólo con payments.
    } catch (err) {
        console.error('[mpSync] account/movements error inesperado:', err.message);
    }

    await account.update({ last_sync_at: new Date() });

    return { ok: true, created, skipped, errors };
}

async function syncAll() {
    const cuentas = await db.MercadoPagoCuentas.findAll({ where: { estado: 'activa' } });
    const summary = { total: cuentas.length, ok: 0, fail: 0, details: [] };

    for (const cuenta of cuentas) {
        try {
            const res = await syncOne(cuenta.user_id);
            if (res.ok) summary.ok++;
            else summary.fail++;
            summary.details.push({ user_id: cuenta.user_id, ...res });
        } catch (err) {
            summary.fail++;
            summary.details.push({ user_id: cuenta.user_id, ok: false, reason: err.message });
        }
    }
    return summary;
}

module.exports = { syncOne, syncAll };
