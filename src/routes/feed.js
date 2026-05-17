// Feed unificado de movimientos: combina Gastos + GastosPruebaN8N + Movimientos.
// Cada fila tiene shape consistente y, si corresponde, el linaje a la entidad
// (deuda/préstamo/objetivo) que generó el movimiento.
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const db = require('../models');
const { authenticateJWT } = require('../security/auth');
const { normalizarTelefono } = require('../utils/phoneUtils');

const isIngreso = (str) => String(str || '').toLowerCase().includes('ingreso');

// Resuelve el tipo de evento a partir del movimiento (si existe) y/o tipo_transaccion del gasto
function resolveEventTypeFromMov(mov) {
    if (mov.tipo === 'toma_deuda') return 'toma_deuda';
    if (mov.tipo === 'otorgamiento_prestamo') return 'otorgamiento_prestamo';
    if (mov.tipo === 'abono') return 'pago_deuda';
    if (mov.tipo === 'cobro') return 'cobro_prestamo';
    if (mov.tipo === 'aporte') return 'aporte_objetivo';
    if (mov.tipo === 'retiro') return 'retiro_objetivo';
    return null;
}

router.get('/', authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const usuario = await db.Usuarios.findByPk(userId);
        const numeroCel = usuario && usuario.telefono ? normalizarTelefono(usuario.telefono) : null;

        const { from, to, divisa, entidad_tipo, entidad_id } = req.query;
        const dateFilter = {};
        if (from) dateFilter[Op.gte] = from;
        if (to) dateFilter[Op.lte] = to;
        const hasDateFilter = !!(from || to);

        // 1. Trae Movimientos (canónicos para abonos/cobros/aportes)
        const movWhere = { user_id: userId };
        if (hasDateFilter) movWhere.fecha = dateFilter;
        if (entidad_tipo) movWhere.entidad_tipo = entidad_tipo;
        if (entidad_id) movWhere.entidad_id = entidad_id;
        const movimientos = await db.Movimientos.findAll({
            where: movWhere,
            order: [['fecha', 'DESC'], ['id', 'DESC']]
        });

        // 2. Resolver entidades referenciadas (batch por tipo para no hacer N+1)
        const entIds = { deuda: new Set(), prestamo: new Set(), objetivo: new Set() };
        movimientos.forEach(m => entIds[m.entidad_tipo].add(m.entidad_id));

        const [deudas, prestamos, objetivos] = await Promise.all([
            entIds.deuda.size ? db.Deudas.findAll({ where: { id: { [Op.in]: [...entIds.deuda] }, user_id: userId } }) : [],
            entIds.prestamo.size ? db.Prestamos.findAll({ where: { id: { [Op.in]: [...entIds.prestamo] }, user_id: userId } }) : [],
            entIds.objetivo.size ? db.Objetivos.findAll({ where: { id: { [Op.in]: [...entIds.objetivo] }, user_id: userId } }) : []
        ]);

        const entidadById = {
            deuda: Object.fromEntries(deudas.map(d => [d.id, { tipo: 'deuda', id: d.id, nombre: d.nombre_acreedor }])),
            prestamo: Object.fromEntries(prestamos.map(p => [p.id, { tipo: 'prestamo', id: p.id, nombre: p.nombre_persona }])),
            objetivo: Object.fromEntries(objetivos.map(o => [o.id, { tipo: 'objetivo', id: o.id, nombre: o.nombre }]))
        };

        // 3. Índice de qué gastos ya están vinculados via Movimientos
        const linkedGastos = new Set();
        movimientos.forEach(m => {
            if (m.gasto_id) linkedGastos.add(`${m.gasto_source}:${m.gasto_id}`);
        });

        // 4. Trae Gastos + GastosPruebaN8N
        const gastosWhere = { usuario_id: userId };
        if (hasDateFilter) gastosWhere.fecha = dateFilter;
        if (divisa) {
            // Divisas en Gastos están via FK — más simple filtrar después
        }

        const gastosN8NWhere = {};
        if (numeroCel) gastosN8NWhere.numero_cel = numeroCel;
        if (hasDateFilter) gastosN8NWhere.fecha = dateFilter;
        if (divisa) gastosN8NWhere.divisa = divisa;

        const [gastos, gastosN8N, tarjetas] = await Promise.all([
            db.Gastos.findAll({
                where: gastosWhere,
                include: [
                    { model: db.Divisas, attributes: ['descripcion'] },
                    { model: db.TiposTransacciones, attributes: ['descripcion'] },
                    { model: db.MetodosPagos, attributes: ['descripcion'] },
                    { model: db.Categorias, attributes: ['descripcion'] }
                ]
            }),
            numeroCel ? db.GastosPruebaN8N.findAll({ where: gastosN8NWhere }) : [],
            db.TarjetasCredito.findAll({ where: { user_id: userId } })
        ]);
        const tarjetasById = Object.fromEntries(tarjetas.map(t => [t.id, { tipo: 'tarjeta', id: t.id, nombre: t.nombre }]));

        // 5. Construir feed unificado
        const feed = [];

        // 5a. Movimientos canónicos — el monto y dirección vienen del Movimiento
        for (const m of movimientos) {
            const entidad = entidadById[m.entidad_tipo]?.[m.entidad_id] || null;
            feed.push({
                id: `m-${m.id}`,
                fecha: m.fecha,
                tipo: resolveEventTypeFromMov(m) || 'gasto',
                monto: parseFloat(m.monto),
                divisa: m.divisa,
                descripcion: m.descripcion || (entidad ? entidad.nombre : ''),
                categoria: m.entidad_tipo === 'deuda' ? 'Deudas' : m.entidad_tipo === 'prestamo' ? 'Préstamos' : 'Ahorro/Objetivo',
                metodo_pago: null,
                entidad,
                source: 'movimientos'
            });
        }

        // 5b. Gastos sueltos (no vinculados a Movimientos)
        for (const g of gastos) {
            if (linkedGastos.has(`gastos:${g.id}`)) continue;
            const div = g.Divisa?.descripcion || 'ARS';
            if (divisa && div !== divisa) continue;
            const tarjeta = g.tarjeta_id ? tarjetasById[g.tarjeta_id] : null;
            feed.push({
                id: `s-${g.id}`,
                fecha: g.fecha,
                tipo: tarjeta ? 'compra_tarjeta' : (isIngreso(g.TiposTransaccion?.descripcion) ? 'ingreso' : 'gasto'),
                monto: parseFloat(g.monto),
                divisa: div,
                descripcion: g.descripcion || '',
                categoria: g.Categoria?.descripcion || 'Sin categoría',
                metodo_pago: g.MetodosPago?.descripcion || null,
                entidad: tarjeta,
                cuotas_total: g.cuotas_total || 1,
                source: 'gastos'
            });
        }

        for (const g of gastosN8N) {
            if (linkedGastos.has(`GastosPruebaN8N:${g.id}`)) continue;
            const tarjeta = g.tarjeta_id ? tarjetasById[g.tarjeta_id] : null;
            const cat = g.categoria || 'Sin categoría';
            // 'Pago Tarjeta' es egreso real generado por el endpoint pagar-resumen
            const tipo = tarjeta ? 'compra_tarjeta' :
                cat === 'Pago Tarjeta' ? 'pago_tarjeta' :
                isIngreso(g.tipos_transaccion) ? 'ingreso' : 'gasto';
            feed.push({
                id: `p-${g.id}`,
                fecha: g.fecha,
                tipo,
                monto: parseFloat(g.monto),
                divisa: g.divisa || 'ARS',
                descripcion: g.descripcion || '',
                categoria: cat,
                metodo_pago: g.metodo_pago || null,
                entidad: tarjeta,
                cuotas_total: g.cuotas_total || 1,
                source: 'GastosPruebaN8N'
            });
        }

        // 6. Filtros finales + orden
        let result = feed;
        if (divisa) result = result.filter(r => r.divisa === divisa);
        result.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

        res.json(result);
    } catch (error) {
        console.error('[feed] error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
