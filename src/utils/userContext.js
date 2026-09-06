// Construye el contexto que recibe el agente IA (system prompt + tools).
// Usado por inbound WhatsApp y por el chat dev del dashboard.
const db = require('../models');
const { normalizarTelefono } = require('./phoneUtils');

// Movimientos MP detectados que esperan que el usuario diga a qué se debieron.
async function loadMpPendientes(usuarioId) {
    const rows = await db.MercadoPagoEventos.findAll({
        where: { user_id: usuarioId, estado: 'pendiente_descripcion' },
        order: [['created_at', 'DESC']],
        limit: 10,
        attributes: ['id', 'monto', 'divisa', 'tipo', 'comercio']
    });
    return rows.map(r => ({
        evento_id: r.id,
        monto: r.monto,
        divisa: r.divisa,
        tipo: r.tipo,
        comercio: r.comercio
    }));
}

const DEFAULT_AGENDA_CATEGORIAS = ['Facultad', 'Trabajo', 'Juntadas/Amigos', 'Personales', 'Familia', 'Partida'];

// Contexto del secretario: flag + categorías (siembra defaults la primera vez si está habilitado).
async function loadSecretario(usuario) {
    if (!usuario.secretario_habilitado) return { secretario_habilitado: false, agenda_categorias: [] };
    let cats = await db.AgendaCategorias.findAll({ where: { user_id: usuario.id, activo: true }, order: [['orden', 'ASC'], ['id', 'ASC']] });
    if (!cats.length) {
        await db.AgendaCategorias.bulkCreate(DEFAULT_AGENDA_CATEGORIAS.map((nombre, i) => ({ user_id: usuario.id, nombre, orden: i, activo: true })));
        cats = await db.AgendaCategorias.findAll({ where: { user_id: usuario.id, activo: true }, order: [['orden', 'ASC'], ['id', 'ASC']] });
    }
    return { secretario_habilitado: true, agenda_categorias: cats.map(c => c.nombre) };
}

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

    const [catalogos, mp_pendientes, secretario] = await Promise.all([
        loadCatalogos(usuario.id),
        loadMpPendientes(usuario.id),
        loadSecretario(usuario)
    ]);
    return {
        userId: usuario.id,
        numero_cel: normalized,
        nombre: usuario.username,
        telefonoPrincipal: usuario.telefono,
        ...catalogos,
        ...secretario,
        mp_pendientes,
        fechaActual: new Date().toISOString().split('T')[0]
    };
}

// Atajo cuando ya tenés el user_id (JWT auth).
async function buildFromUserId(userId) {
    const usuario = await db.Usuarios.findByPk(userId);
    if (!usuario) throw new Error('Usuario no encontrado');
    const [catalogos, mp_pendientes, secretario] = await Promise.all([
        loadCatalogos(userId),
        loadMpPendientes(userId),
        loadSecretario(usuario)
    ]);
    return {
        userId: usuario.id,
        numero_cel: normalizarTelefono(usuario.telefono),
        nombre: usuario.username,
        telefonoPrincipal: usuario.telefono,
        ...catalogos,
        ...secretario,
        mp_pendientes,
        fechaActual: new Date().toISOString().split('T')[0]
    };
}

module.exports = { buildFromWaId, buildFromUserId };
