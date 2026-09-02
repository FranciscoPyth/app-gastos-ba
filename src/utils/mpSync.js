// Sincronización de movimientos de Mercado Pago.
//
// Para cada usuario con cuenta MP activa:
//   1. Trae payments desde last_sync_at (via /v1/payments/search).
//   2. Por cada item nuevo: deduplica via MercadoPagoEventos y lo guarda con
//      estado 'pendiente_descripcion' (NO crea el gasto todavía).
//   3. Le manda un WhatsApp al usuario preguntando a qué se debió el movimiento.
//      El gasto se registra recién cuando el usuario responde (tool
//      describir_movimiento_mp en el agente IA).
//   4. Actualiza last_sync_at.
const db = require('../models');
const mp = require('./mercadopago');
const { notifyUser } = require('../services/notify');
const { normalizarTelefono } = require('./phoneUtils');

// Si está configurado un template aprobado, el aviso de MP se manda como template
// (se entrega aunque el usuario esté inactivo +24h). Si no, cae al texto libre
// (solo se entrega dentro de la ventana de 24h).
const MP_TEMPLATE = process.env.WHATSAPP_MP_TEMPLATE;
const MP_TEMPLATE_LANG = process.env.WHATSAPP_MP_TEMPLATE_LANG || 'es';

// operation_type que SÍ representan gastos/ingresos reales y se preguntan.
// Se excluyen 'investment' (capital al/del fondo, no es gasto; los rendimientos
// no se emiten como movimiento) y 'partition_transfer' (interno ARS/USD).
// Verificado empíricamente contra la cuenta real (scripts/mp-probe.js).
const ALLOWED_OPS = new Set(['regular_payment', 'money_transfer', 'account_fund']);

// Deriva los datos básicos del movimiento (sentido, monto, divisa, comercio).
function derivePayment(payment, mpUserId) {
    // Si el usuario es el cobrador (collector), es ingreso. Si es el pagador, gasto.
    const collectorId = payment.collector_id || (payment.collector && payment.collector.id);
    const isIncome = String(collectorId) === String(mpUserId);
    const tipo = isIncome ? 'Ingreso' : 'Gasto';

    const monto = parseFloat(payment.transaction_amount || 0);
    const divisa = (payment.currency_id || 'ARS').toUpperCase();

    // Hint del comercio: solo descripción "real" de MP (no el fallback genérico).
    let comercio = payment.description || '';
    if (!comercio && payment.additional_info && Array.isArray(payment.additional_info.items)) {
        comercio = payment.additional_info.items.map(i => i.title).filter(Boolean).join(', ');
    }

    return { tipo, monto, divisa, comercio: comercio ? comercio.substring(0, 255) : null };
}

function mensajeAviso({ tipo, monto, divisa, comercio }) {
    const tipoTxt = tipo === 'Ingreso' ? 'un ingreso' : 'un gasto';
    const montoTxt = Number(monto).toLocaleString('es-AR');
    const comercioTxt = comercio ? ` (${comercio})` : '';
    return `💳 Detecté ${tipoTxt} de *$${montoTxt} ${divisa}* en Mercado Pago${comercioTxt}. ¿A qué se debió?`;
}

// Texto que llena {{1}} del template MP: "un ingreso de $100 ARS (Comercio)".
function resumenMovimiento({ tipo, monto, divisa, comercio }) {
    const tipoTxt = tipo === 'Ingreso' ? 'un ingreso' : 'un gasto';
    const montoTxt = Number(monto).toLocaleString('es-AR');
    const comercioTxt = comercio ? ` (${comercio})` : '';
    return `${tipoTxt} de $${montoTxt} ${divisa}${comercioTxt}`;
}

// Avisa el movimiento por el canal del usuario: Telegram si está vinculado (gratis),
// si no WhatsApp (template si está configurado para entregar fuera de la ventana de 24h).
async function avisarMovimiento(user, info) {
    return notifyUser(user, {
        text: mensajeAviso(info),
        whatsappTemplate: MP_TEMPLATE || undefined,
        whatsappTemplateLang: MP_TEMPLATE_LANG,
        whatsappParams: [resumenMovimiento(info)]
    });
}

async function syncOne(userId, { force = false } = {}) {
    const result = await mp.getValidAccessToken(userId);
    if (!result) return { ok: false, reason: 'no_account_or_expired' };
    const { account, token } = result;

    const user = await db.Usuarios.findByPk(userId);

    const since = force ? null : (account.last_sync_at ? new Date(account.last_sync_at).toISOString() : null);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    // ---- Payments ----
    // Solo aprobados: no preguntamos por pagos pendientes/rechazados.
    try {
        const paymentsRes = await mp.searchPayments(token, { since, limit: 50 });
        const results = (paymentsRes && paymentsRes.results) || [];

        for (const payment of results) {
            if (payment.status && payment.status !== 'approved') { skipped++; continue; }
            if (payment.operation_type && !ALLOWED_OPS.has(payment.operation_type)) { skipped++; continue; }

            const resourceId = String(payment.id);
            const existing = await db.MercadoPagoEventos.findOne({ where: { mp_resource_id: resourceId } });
            if (existing) { skipped++; continue; }

            try {
                const info = derivePayment(payment, account.mp_user_id);

                // Guardamos el movimiento como PENDIENTE de descripción. No creamos el gasto:
                // eso ocurre cuando el usuario responde por WhatsApp (describir_movimiento_mp).
                await db.MercadoPagoEventos.create({
                    user_id: userId,
                    mp_resource_id: resourceId,
                    mp_resource_type: 'payment',
                    origen: 'webhook',
                    raw_payload: payment,
                    procesado: false,
                    estado: 'pendiente_descripcion',
                    monto: info.monto,
                    divisa: info.divisa,
                    tipo: info.tipo,
                    comercio: info.comercio
                });
                created++;

                // Avisamos al usuario y le pedimos la descripción.
                if (user && (user.telegram_chat_id || user.telefono)) {
                    try {
                        await avisarMovimiento(user, info);
                        // Guardamos el aviso en el historial del asistente para que el agente
                        // tenga el contexto de la conversación cuando el usuario responda.
                        // La clave de historial coincide con la que usa el inbound (teléfono
                        // normalizado, o tg:<chatId> si el usuario no tiene teléfono).
                        await db.ChatMessages.create({
                            wa_id: user.telefono ? normalizarTelefono(user.telefono) : `tg:${user.telegram_chat_id}`,
                            role: 'assistant',
                            content: mensajeAviso(info),
                            created_at: new Date()
                        });
                    } catch (sendErr) {
                        console.error(`[mpSync] no se pudo avisar payment ${resourceId}:`, sendErr.response ? sendErr.response.data : sendErr.message);
                    }
                }
            } catch (err) {
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
