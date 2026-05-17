// Cálculos del ciclo de tarjeta de crédito.
//
// Período = ventana entre dos cierres consecutivos.
// Cada compra cae en el período cuyo cierre es POSTERIOR a la fecha de compra.
// El "próximo vencimiento" es el día del mes que sigue al cierre del período cerrado.
//
// Cuotas: una compra de N cuotas se reparte una cuota por período consecutivo
// empezando desde el período donde cayó la compra.

const { Op } = require('sequelize');
const db = require('../models');

function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

// Resuelve un día del mes respetando meses cortos (28 feb → último día).
function safeDayOfMonth(year, month0, day) {
    const lastDay = new Date(year, month0 + 1, 0).getDate();
    return new Date(year, month0, Math.min(day, lastDay));
}

// Fecha del próximo cierre relativo a una fecha base (default: hoy).
function nextCierre(diaCierre, base = new Date()) {
    const b = new Date(base);
    const candidate = safeDayOfMonth(b.getFullYear(), b.getMonth(), diaCierre);
    if (candidate < b) {
        return safeDayOfMonth(b.getFullYear(), b.getMonth() + 1, diaCierre);
    }
    return candidate;
}

// Cierre anterior (último que ya pasó).
function previousCierre(diaCierre, base = new Date()) {
    const b = new Date(base);
    const candidate = safeDayOfMonth(b.getFullYear(), b.getMonth(), diaCierre);
    if (candidate >= b) {
        return safeDayOfMonth(b.getFullYear(), b.getMonth() - 1, diaCierre);
    }
    return candidate;
}

// Vencimiento asociado a un cierre dado.
// - Si dia_vencimiento > dia_cierre → vence en el MISMO mes del cierre (ej: MP cierra 18, vence 26 mismo mes).
// - Si dia_vencimiento <= dia_cierre → vence en el mes SIGUIENTE al cierre (ej: cierra 25, vence 5 del mes que viene).
function vencimientoForCierre(fechaCierre, diaVencimiento) {
    const c = new Date(fechaCierre);
    const diaCierre = c.getDate();
    const monthOffset = diaVencimiento > diaCierre ? 0 : 1;
    return safeDayOfMonth(c.getFullYear(), c.getMonth() + monthOffset, diaVencimiento);
}

// Diferencia en días.
function daysBetween(a, b) {
    return Math.ceil((new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24));
}

// Identifica a qué período (índice 0,1,2... desde una compra) corresponde una cuota dada.
// Una compra del 15/01 con 12 cuotas y dia_cierre=5 →
//   cuota 1 cae en el período que cierra el 05/02
//   cuota 2 → 05/03
//   ...
function cierreDeCuota(fechaCompra, indiceCuota, diaCierre) {
    // El primer cierre POSTERIOR a la fecha de compra es la cuota 1.
    const c1 = nextCierre(diaCierre, fechaCompra);
    return safeDayOfMonth(c1.getFullYear(), c1.getMonth() + indiceCuota, diaCierre);
}

// Para un período (cierre actual: fecha del cierre que cierra el período en curso),
// calculá: ¿qué compras caen y por qué monto cada una?
//
// El "período en curso" es el que cerrará en `nextCierre`. Empieza inmediatamente
// después del cierre anterior y termina en `nextCierre`.
async function getResumenPeriodo(tarjeta, opts = {}) {
    const periodoCierre = opts.periodoCierre || nextCierre(tarjeta.dia_cierre);
    const cierreAnterior = safeDayOfMonth(periodoCierre.getFullYear(), periodoCierre.getMonth() - 1, tarjeta.dia_cierre);

    // Traemos TODAS las compras de la tarjeta — de las DOS tablas (Gastos + GastosPruebaN8N).
    // No filtramos por fecha porque cuotas de compras viejas pueden caer en este período.
    const [comprasG, comprasN] = await Promise.all([
        db.Gastos.findAll({
            where: { usuario_id: tarjeta.user_id, tarjeta_id: tarjeta.id },
            include: [
                { model: db.Categorias, attributes: ['descripcion'] },
                { model: db.Divisas, attributes: ['descripcion'] }
            ]
        }),
        db.GastosPruebaN8N.findAll({
            where: { tarjeta_id: tarjeta.id }
        })
    ]);
    // Normalizamos a una shape común
    const compras = [
        ...comprasG.map(c => ({
            id: c.id, descripcion: c.descripcion, monto: c.monto, fecha: c.fecha,
            cuotas_total: c.cuotas_total || 1,
            divisa: c.Divisa?.descripcion || tarjeta.divisa_resumen,
            categoria: c.Categoria?.descripcion,
            source: 'gastos'
        })),
        ...comprasN.map(c => ({
            id: c.id, descripcion: c.descripcion, monto: c.monto, fecha: c.fecha,
            cuotas_total: c.cuotas_total || 1,
            divisa: c.divisa || tarjeta.divisa_resumen,
            categoria: c.categoria,
            source: 'GastosPruebaN8N'
        }))
    ];

    const items = [];
    let totalPeriodo = 0;

    for (const c of compras) {
        const fechaCompra = new Date(c.fecha);
        const totalCuotas = c.cuotas_total || 1;
        const montoCuota = num(c.monto) / totalCuotas;

        for (let i = 0; i < totalCuotas; i++) {
            const cierreDeEsta = cierreDeCuota(fechaCompra, i, tarjeta.dia_cierre);
            if (cierreDeEsta.toDateString() === periodoCierre.toDateString()) {
                items.push({
                    gasto_id: c.id,
                    source: c.source,
                    descripcion: c.descripcion,
                    fecha_compra: c.fecha,
                    cuota_actual: i + 1,
                    cuotas_total: totalCuotas,
                    monto_cuota: montoCuota,
                    monto_total_compra: num(c.monto),
                    divisa: c.divisa,
                    categoria: c.categoria
                });
                totalPeriodo += montoCuota;
                break;
            }
        }
    }

    return {
        cierre_anterior: cierreAnterior,
        proximo_cierre: periodoCierre,
        proximo_vencimiento: vencimientoForCierre(periodoCierre, tarjeta.dia_vencimiento),
        total: totalPeriodo,
        divisa: tarjeta.divisa_resumen,
        items
    };
}

// Devuelve la tarjeta enriquecida con sus próximas fechas + un resumen rápido.
async function enrichTarjeta(tarjeta) {
    const proxCierre = nextCierre(tarjeta.dia_cierre);
    const proxVenc = vencimientoForCierre(proxCierre, tarjeta.dia_vencimiento);
    const resumen = await getResumenPeriodo(tarjeta, { periodoCierre: proxCierre });
    return {
        ...tarjeta.toJSON(),
        proximo_cierre: proxCierre,
        proximo_vencimiento: proxVenc,
        dias_al_cierre: daysBetween(proxCierre, new Date()),
        dias_al_vencimiento: daysBetween(proxVenc, new Date()),
        consumo_periodo: resumen.total,
        items_periodo: resumen.items.length
    };
}

module.exports = {
    nextCierre,
    previousCierre,
    vencimientoForCierre,
    daysBetween,
    cierreDeCuota,
    getResumenPeriodo,
    enrichTarjeta
};
