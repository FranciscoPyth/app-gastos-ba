// Lógica compartida para registrar movimientos sobre deudas, préstamos y objetivos.
// Todas las operaciones se ejecutan en una transacción atómica:
//   1. Actualiza saldo_restante / monto_actual y estado de la entidad
//   2. Inserta registro en Movimientos (historial canónico)
//   3. Inserta gasto espejo en GastosPruebaN8N (para que aparezca en el flujo de plata)

const db = require('../models');
const { normalizarTelefono } = require('./phoneUtils');

function num(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
}

async function getPhone(numero_cel, userId) {
    if (numero_cel) return normalizarTelefono(numero_cel);
    const user = await db.Usuarios.findByPk(userId);
    return user && user.telefono ? user.telefono : '0000000000';
}

// ---------- DEUDAS ----------
async function registrarAbonoDeuda({ deuda, monto, fecha, numero_cel, marcar_cerrada }) {
    const t = await db.sequelize.transaction();
    try {
        const montoNum = num(monto);
        if (montoNum <= 0) throw new Error('El monto del abono debe ser mayor a 0');

        const saldoActual = num(deuda.saldo_restante);
        const nuevoSaldo = Math.max(0, saldoActual - montoNum);
        let nuevoEstado = deuda.estado;
        if (marcar_cerrada || nuevoSaldo <= 0) nuevoEstado = 'cerrada';
        else if (nuevoSaldo < num(deuda.monto_original)) nuevoEstado = 'parcial';

        await deuda.update({ saldo_restante: nuevoSaldo, estado: nuevoEstado }, { transaction: t });

        const fechaMov = fecha || new Date().toISOString().split('T')[0];
        const cel = await getPhone(numero_cel, deuda.user_id);

        const gasto = await db.GastosPruebaN8N.create({
            numero_cel: cel,
            descripcion: `Pago deuda: ${deuda.nombre_acreedor}`,
            monto: montoNum,
            fecha: fechaMov,
            divisa: deuda.divisa,
            tipos_transaccion: 'Gasto',
            categoria: 'Deudas'
        }, { transaction: t });

        const movimiento = await db.Movimientos.create({
            user_id: deuda.user_id,
            entidad_tipo: 'deuda',
            entidad_id: deuda.id,
            tipo: 'abono',
            monto: montoNum,
            divisa: deuda.divisa,
            fecha: fechaMov,
            gasto_id: gasto.id,
            gasto_source: 'GastosPruebaN8N',
            descripcion: `Pago a ${deuda.nombre_acreedor}`
        }, { transaction: t });

        await t.commit();
        return { deuda: await deuda.reload(), movimiento, gasto };
    } catch (err) {
        await t.rollback();
        throw err;
    }
}

// ---------- PRESTAMOS ----------
async function registrarCobroPrestamo({ prestamo, monto, fecha, numero_cel, marcar_pagado }) {
    const t = await db.sequelize.transaction();
    try {
        const montoNum = num(monto);
        if (montoNum <= 0) throw new Error('El monto del cobro debe ser mayor a 0');

        const saldoActual = num(prestamo.saldo_restante);
        const nuevoSaldo = Math.max(0, saldoActual - montoNum);
        let nuevoEstado = prestamo.estado;
        if (marcar_pagado || nuevoSaldo <= 0) nuevoEstado = 'pagado';
        else if (nuevoSaldo < num(prestamo.monto_original)) nuevoEstado = 'parcial';

        await prestamo.update({ saldo_restante: nuevoSaldo, estado: nuevoEstado }, { transaction: t });

        const fechaMov = fecha || new Date().toISOString().split('T')[0];
        const cel = await getPhone(numero_cel, prestamo.user_id);

        const gasto = await db.GastosPruebaN8N.create({
            numero_cel: cel,
            descripcion: `Devolución préstamo: ${prestamo.nombre_persona}`,
            monto: montoNum,
            fecha: fechaMov,
            divisa: prestamo.divisa,
            tipos_transaccion: 'Ingreso',
            categoria: 'Préstamos'
        }, { transaction: t });

        const movimiento = await db.Movimientos.create({
            user_id: prestamo.user_id,
            entidad_tipo: 'prestamo',
            entidad_id: prestamo.id,
            tipo: 'cobro',
            monto: montoNum,
            divisa: prestamo.divisa,
            fecha: fechaMov,
            gasto_id: gasto.id,
            gasto_source: 'GastosPruebaN8N',
            descripcion: `Cobro de ${prestamo.nombre_persona}`
        }, { transaction: t });

        await t.commit();
        return { prestamo: await prestamo.reload(), movimiento, gasto };
    } catch (err) {
        await t.rollback();
        throw err;
    }
}

// ---------- OBJETIVOS ----------
async function registrarMovimientoObjetivo({ objetivo, monto, fecha, numero_cel, tipo }) {
    // tipo: 'aporte' (sumo plata) | 'retiro' (saco plata del ahorro)
    const t = await db.sequelize.transaction();
    try {
        const montoNum = num(monto);
        if (montoNum <= 0) throw new Error('El monto debe ser mayor a 0');
        if (tipo !== 'aporte' && tipo !== 'retiro') throw new Error('Tipo inválido para objetivo');

        const actual = num(objetivo.monto_actual);
        const delta = tipo === 'aporte' ? montoNum : -montoNum;
        const nuevoActual = Math.max(0, actual + delta);

        let nuevoEstado = objetivo.estado;
        if (nuevoActual >= num(objetivo.monto_objetivo)) nuevoEstado = 'completada';
        else nuevoEstado = 'activa';

        await objetivo.update({ monto_actual: nuevoActual, estado: nuevoEstado }, { transaction: t });

        const fechaMov = fecha || new Date().toISOString().split('T')[0];
        const cel = await getPhone(numero_cel, objetivo.user_id);

        const gasto = await db.GastosPruebaN8N.create({
            numero_cel: cel,
            descripcion: tipo === 'aporte'
                ? `Ahorro objetivo: ${objetivo.nombre}`
                : `Retiro de ahorro: ${objetivo.nombre}`,
            monto: montoNum,
            fecha: fechaMov,
            divisa: objetivo.divisa || 'ARS',
            tipos_transaccion: tipo === 'aporte' ? 'Gasto' : 'Ingreso',
            categoria: 'Ahorro/Objetivo'
        }, { transaction: t });

        const movimiento = await db.Movimientos.create({
            user_id: objetivo.user_id,
            entidad_tipo: 'objetivo',
            entidad_id: objetivo.id,
            tipo,
            monto: montoNum,
            divisa: objetivo.divisa || 'ARS',
            fecha: fechaMov,
            gasto_id: gasto.id,
            gasto_source: 'GastosPruebaN8N',
            descripcion: tipo === 'aporte' ? `Aporte a ${objetivo.nombre}` : `Retiro de ${objetivo.nombre}`
        }, { transaction: t });

        await t.commit();
        return { objetivo: await objetivo.reload(), movimiento, gasto };
    } catch (err) {
        await t.rollback();
        throw err;
    }
}

// Borra un movimiento y revierte su efecto sobre la entidad y el gasto espejo.
async function eliminarMovimiento(movimientoId, userId) {
    const t = await db.sequelize.transaction();
    try {
        const mov = await db.Movimientos.findOne({
            where: { id: movimientoId, user_id: userId },
            transaction: t
        });
        if (!mov) throw new Error('Movimiento no encontrado');

        const monto = num(mov.monto);

        if (mov.entidad_tipo === 'deuda') {
            const deuda = await db.Deudas.findByPk(mov.entidad_id, { transaction: t });
            if (deuda) {
                const nuevoSaldo = Math.min(num(deuda.monto_original), num(deuda.saldo_restante) + monto);
                let estado = deuda.estado;
                if (nuevoSaldo >= num(deuda.monto_original)) estado = 'activa';
                else if (nuevoSaldo > 0) estado = 'parcial';
                await deuda.update({ saldo_restante: nuevoSaldo, estado }, { transaction: t });
            }
        } else if (mov.entidad_tipo === 'prestamo') {
            const prestamo = await db.Prestamos.findByPk(mov.entidad_id, { transaction: t });
            if (prestamo) {
                const nuevoSaldo = Math.min(num(prestamo.monto_original), num(prestamo.saldo_restante) + monto);
                let estado = prestamo.estado;
                if (nuevoSaldo >= num(prestamo.monto_original)) estado = 'pendiente';
                else if (nuevoSaldo > 0) estado = 'parcial';
                await prestamo.update({ saldo_restante: nuevoSaldo, estado }, { transaction: t });
            }
        } else if (mov.entidad_tipo === 'objetivo') {
            const objetivo = await db.Objetivos.findByPk(mov.entidad_id, { transaction: t });
            if (objetivo) {
                const delta = mov.tipo === 'aporte' ? -monto : monto;
                const nuevoActual = Math.max(0, num(objetivo.monto_actual) + delta);
                let estado = nuevoActual >= num(objetivo.monto_objetivo) ? 'completada' : 'activa';
                await objetivo.update({ monto_actual: nuevoActual, estado }, { transaction: t });
            }
        }

        if (mov.gasto_id && mov.gasto_source === 'GastosPruebaN8N') {
            await db.GastosPruebaN8N.destroy({ where: { id: mov.gasto_id }, transaction: t });
        } else if (mov.gasto_id && mov.gasto_source === 'gastos') {
            await db.Gastos.destroy({ where: { id: mov.gasto_id }, transaction: t });
        }

        await mov.destroy({ transaction: t });
        await t.commit();
        return true;
    } catch (err) {
        await t.rollback();
        throw err;
    }
}

// ---------- CREACIÓN DE DEUDA (toma_deuda: entra plata) ----------
async function registrarCreacionDeuda(deuda, { numero_cel } = {}) {
    const t = await db.sequelize.transaction();
    try {
        const monto = num(deuda.monto_original);
        if (monto <= 0) {
            await t.rollback();
            return null;
        }
        const fechaMov = deuda.fecha_inicio
            ? new Date(deuda.fecha_inicio).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0];
        const cel = await getPhone(numero_cel, deuda.user_id);

        const gasto = await db.GastosPruebaN8N.create({
            numero_cel: cel,
            descripcion: `Toma de deuda: ${deuda.nombre_acreedor}`,
            monto,
            fecha: fechaMov,
            divisa: deuda.divisa,
            tipos_transaccion: 'Ingreso',
            categoria: 'Deudas'
        }, { transaction: t });

        const movimiento = await db.Movimientos.create({
            user_id: deuda.user_id,
            entidad_tipo: 'deuda',
            entidad_id: deuda.id,
            tipo: 'toma_deuda',
            monto,
            divisa: deuda.divisa,
            fecha: fechaMov,
            gasto_id: gasto.id,
            gasto_source: 'GastosPruebaN8N',
            descripcion: `Toma de deuda con ${deuda.nombre_acreedor}`
        }, { transaction: t });

        await t.commit();
        return { movimiento, gasto };
    } catch (err) {
        await t.rollback();
        throw err;
    }
}

// ---------- CREACIÓN DE PRÉSTAMO (otorgamiento: sale plata) ----------
async function registrarCreacionPrestamo(prestamo, { numero_cel } = {}) {
    const t = await db.sequelize.transaction();
    try {
        const monto = num(prestamo.monto_original);
        if (monto <= 0) {
            await t.rollback();
            return null;
        }
        const fechaMov = prestamo.fecha_prestamo
            ? new Date(prestamo.fecha_prestamo).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0];
        const cel = await getPhone(numero_cel, prestamo.user_id);

        const gasto = await db.GastosPruebaN8N.create({
            numero_cel: cel,
            descripcion: `Préstamo otorgado a ${prestamo.nombre_persona}`,
            monto,
            fecha: fechaMov,
            divisa: prestamo.divisa,
            tipos_transaccion: 'Gasto',
            categoria: 'Préstamos'
        }, { transaction: t });

        const movimiento = await db.Movimientos.create({
            user_id: prestamo.user_id,
            entidad_tipo: 'prestamo',
            entidad_id: prestamo.id,
            tipo: 'otorgamiento_prestamo',
            monto,
            divisa: prestamo.divisa,
            fecha: fechaMov,
            gasto_id: gasto.id,
            gasto_source: 'GastosPruebaN8N',
            descripcion: `Préstamo a ${prestamo.nombre_persona}`
        }, { transaction: t });

        await t.commit();
        return { movimiento, gasto };
    } catch (err) {
        await t.rollback();
        throw err;
    }
}

module.exports = {
    registrarAbonoDeuda,
    registrarCobroPrestamo,
    registrarMovimientoObjetivo,
    registrarCreacionDeuda,
    registrarCreacionPrestamo,
    eliminarMovimiento
};
