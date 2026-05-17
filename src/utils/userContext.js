// Construye el contexto que recibe el agente IA (system prompt + tools).
// Usado por inbound WhatsApp y por el chat dev del dashboard.
const db = require('../models');
const { normalizarTelefono } = require('./phoneUtils');

async function loadCatalogos(usuarioId) {
    const [cats, divs, pms, tps] = await Promise.all([
        db.Categorias.findAll({ where: { usuario_id: usuarioId }, attributes: ['descripcion'] }),
        db.Divisas.findAll({ where: { usuario_id: usuarioId }, attributes: ['descripcion'] }),
        db.MetodosPagos.findAll({ where: { usuario_id: usuarioId }, attributes: ['descripcion'] }),
        db.TiposTransacciones.findAll({ where: { usuario_id: usuarioId }, attributes: ['descripcion'] })
    ]);
    return {
        categorias: cats.map(c => c.descripcion),
        divisas: divs.map(d => d.descripcion),
        medios_pago: pms.map(p => p.descripcion),
        tipos_transaccion: tps.map(t => t.descripcion)
    };
}

// Construye contexto a partir del waId (teléfono normalizado).
// Resuelve el user_id internamente.
async function buildFromWaId(waId) {
    const normalized = normalizarTelefono(waId);
    const usuario = await db.Usuarios.findOne({ where: { telefono: normalized } });

    if (!usuario) {
        return {
            numero_cel: normalized,
            nombre: null,
            telefonoPrincipal: normalized,
            categorias: [],
            divisas: [],
            medios_pago: [],
            tipos_transaccion: [],
            fechaActual: new Date().toISOString().split('T')[0]
        };
    }

    const catalogos = await loadCatalogos(usuario.id);
    return {
        userId: usuario.id,
        numero_cel: normalized,
        nombre: usuario.username,
        telefonoPrincipal: usuario.telefono,
        ...catalogos,
        fechaActual: new Date().toISOString().split('T')[0]
    };
}

// Atajo cuando ya tenés el user_id (JWT auth).
async function buildFromUserId(userId) {
    const usuario = await db.Usuarios.findByPk(userId);
    if (!usuario) throw new Error('Usuario no encontrado');
    const catalogos = await loadCatalogos(userId);
    return {
        userId: usuario.id,
        numero_cel: normalizarTelefono(usuario.telefono),
        nombre: usuario.username,
        telefonoPrincipal: usuario.telefono,
        ...catalogos,
        fechaActual: new Date().toISOString().split('T')[0]
    };
}

module.exports = { buildFromWaId, buildFromUserId };
