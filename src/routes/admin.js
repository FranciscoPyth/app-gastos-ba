// Panel de administración de plataforma (solo cuentas is_admin).
// GET /api/admin/metrics  -> métricas agregadas de todo el producto.
const express = require('express');
const router = express.Router();
const db = require('../models');
const { authenticateJWT } = require('../security/auth');
const requireAdmin = require('../security/requireAdmin');
const { sendTemplate } = require('../services/whatsapp/sender');
const { normalizarTelefono, obtenerVariantesTelefono } = require('../utils/phoneUtils');

const QueryTypes = db.Sequelize.QueryTypes;
const q = (sql, replacements) =>
  db.sequelize.query(sql, { type: QueryTypes.SELECT, replacements });

const REENGAGE_TEMPLATE = process.env.WHATSAPP_REENGAGE_TEMPLATE || 'reenganche_controlalo';
const REENGAGE_LANG = process.env.WHATSAPP_REENGAGE_LANG || 'es';

// Subconsulta reutilizable: primera actividad por usuario (proxy de fecha de alta).
// Combina el primer gasto (Gastos.fecha) y el primer movimiento (Movimientos.created_at).
const FIRST_ACTIVITY = `
  SELECT user_id, MIN(d) AS first_activity FROM (
    SELECT usuario_id AS user_id, DATE(fecha) AS d FROM Gastos
    UNION ALL
    SELECT user_id, DATE(created_at) AS d FROM Movimientos
  ) act GROUP BY user_id`;

router.get('/metrics', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const [
      usuarios,
      activos7,
      activos30,
      altasPorMes,
      altas7,
      altas30,
      gastosTotales,
      movimientosTotales,
      gastos7,
      gastos30,
      topUsuarios,
      chatTotales,
      chatPorDia,
      suscEstado,
      suscUsuarios,
      feedbackResumen,
      feedbackDist,
      feedbackReciente,
    ] = await Promise.all([
      // --- Usuarios ---
      q(`SELECT
           COUNT(*) AS total,
           SUM(has_completed_onboarding = 1) AS onboarding_completo,
           SUM(is_admin = 1) AS admins
         FROM Usuarios`),
      // --- Activos últimos 7 días (gasto o movimiento) ---
      q(`SELECT COUNT(DISTINCT user_id) AS n FROM (
           SELECT usuario_id AS user_id FROM Gastos WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
           UNION
           SELECT user_id FROM Movimientos WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
         ) t`),
      q(`SELECT COUNT(DISTINCT user_id) AS n FROM (
           SELECT usuario_id AS user_id FROM Gastos WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
           UNION
           SELECT user_id FROM Movimientos WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         ) t`),
      // --- Altas (proxy 1ra actividad) por mes, últimos 12 meses ---
      q(`SELECT DATE_FORMAT(first_activity, '%Y-%m') AS mes, COUNT(*) AS altas
         FROM (${FIRST_ACTIVITY}) fa
         WHERE first_activity >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
         GROUP BY mes ORDER BY mes ASC`),
      q(`SELECT COUNT(*) AS n FROM (${FIRST_ACTIVITY}) fa
         WHERE first_activity >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`),
      q(`SELECT COUNT(*) AS n FROM (${FIRST_ACTIVITY}) fa
         WHERE first_activity >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`),
      // --- Uso de la app ---
      q(`SELECT COUNT(*) AS total FROM Gastos`),
      q(`SELECT COUNT(*) AS total FROM Movimientos`),
      q(`SELECT COUNT(*) AS n FROM Gastos WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`),
      q(`SELECT COUNT(*) AS n FROM Gastos WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`),
      // Top 10 usuarios por cantidad de gastos cargados
      q(`SELECT u.id, u.username, u.email, COUNT(g.id) AS gastos
         FROM Usuarios u JOIN Gastos g ON g.usuario_id = u.id
         GROUP BY u.id, u.username, u.email
         ORDER BY gastos DESC LIMIT 10`),
      // --- IA / WhatsApp ---
      q(`SELECT
           COUNT(*) AS total_mensajes,
           COUNT(DISTINCT wa_id) AS usuarios_wa,
           SUM(created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS mensajes_7d,
           SUM(created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS mensajes_30d,
           COUNT(DISTINCT CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN wa_id END) AS wa_activos_30d
         FROM ChatMessages`),
      // Mensajes IA por día (últimos 30 días)
      q(`SELECT DATE(created_at) AS dia, COUNT(*) AS mensajes
         FROM ChatMessages WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         GROUP BY dia ORDER BY dia ASC`),
      // --- Suscripciones (feature: el usuario trackea sus suscripciones) ---
      q(`SELECT estado, COUNT(*) AS n FROM Suscripciones GROUP BY estado`),
      q(`SELECT COUNT(DISTINCT user_id) AS usuarios FROM Suscripciones`),
      // --- Feedback ---
      q(`SELECT
           COUNT(*) AS total,
           ROUND(AVG(rating), 2) AS rating_promedio,
           SUM(created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS ultimos_30d
         FROM feedback`),
      q(`SELECT rating, COUNT(*) AS n FROM feedback GROUP BY rating ORDER BY rating ASC`),
      q(`SELECT f.rating, f.comment, f.source, f.created_at, u.username
         FROM feedback f LEFT JOIN Usuarios u ON u.id = f.user_id
         WHERE f.comment IS NOT NULL AND f.comment <> ''
         ORDER BY f.created_at DESC LIMIT 10`),
    ]);

    const u = usuarios[0] || {};
    const total = Number(u.total) || 0;
    const onboardingCompleto = Number(u.onboarding_completo) || 0;

    res.json({
      generado: new Date().toISOString(),
      usuarios: {
        total,
        onboarding_completo: onboardingCompleto,
        onboarding_pct: total ? Math.round((onboardingCompleto / total) * 100) : 0,
        admins: Number(u.admins) || 0,
        activos_7d: Number(activos7[0]?.n) || 0,
        activos_30d: Number(activos30[0]?.n) || 0,
        altas_7d: Number(altas7[0]?.n) || 0,
        altas_30d: Number(altas30[0]?.n) || 0,
        altas_por_mes: altasPorMes,
      },
      uso: {
        gastos_totales: Number(gastosTotales[0]?.total) || 0,
        movimientos_totales: Number(movimientosTotales[0]?.total) || 0,
        gastos_7d: Number(gastos7[0]?.n) || 0,
        gastos_30d: Number(gastos30[0]?.n) || 0,
        gastos_promedio_por_usuario: total
          ? Math.round(((Number(gastosTotales[0]?.total) || 0) / total) * 10) / 10
          : 0,
        top_usuarios: topUsuarios,
      },
      ia: {
        total_mensajes: Number(chatTotales[0]?.total_mensajes) || 0,
        usuarios_wa: Number(chatTotales[0]?.usuarios_wa) || 0,
        mensajes_7d: Number(chatTotales[0]?.mensajes_7d) || 0,
        mensajes_30d: Number(chatTotales[0]?.mensajes_30d) || 0,
        wa_activos_30d: Number(chatTotales[0]?.wa_activos_30d) || 0,
        mensajes_por_dia: chatPorDia,
      },
      suscripciones: {
        usuarios_con_suscripciones: Number(suscUsuarios[0]?.usuarios) || 0,
        por_estado: suscEstado,
      },
      feedback: {
        total: Number(feedbackResumen[0]?.total) || 0,
        rating_promedio: Number(feedbackResumen[0]?.rating_promedio) || 0,
        ultimos_30d: Number(feedbackResumen[0]?.ultimos_30d) || 0,
        distribucion: feedbackDist,
        recientes: feedbackReciente,
      },
    });
  } catch (err) {
    console.error('[admin/metrics] error:', err);
    res.status(500).json({ message: 'Error obteniendo métricas' });
  }
});

// ============================================================
//  Panel de usuarios + re-enganche
// ============================================================

// Construye el resumen enriquecido de todos los usuarios (última interacción,
// días inactivo, alta proxy, estado de recordatorio). Reusado por la lista y el masivo.
async function buildUsuariosResumen() {
  const [usuarios, chatAgg, firstChat, firstAct, rem] = await Promise.all([
    db.Usuarios.findAll({ attributes: ['id', 'username', 'email', 'telefono', 'has_completed_onboarding', 'is_admin'] }),
    q(`SELECT wa_id, MAX(created_at) ultima, COUNT(*) total FROM ChatMessages WHERE role='user' GROUP BY wa_id`),
    q(`SELECT wa_id, MIN(created_at) first_chat FROM ChatMessages GROUP BY wa_id`),
    q(`SELECT user_id, MIN(d) first_activity FROM (
         SELECT usuario_id AS user_id, DATE(fecha) AS d FROM Gastos
         UNION ALL SELECT user_id, DATE(created_at) AS d FROM Movimientos
       ) t GROUP BY user_id`),
    q(`SELECT user_id, MAX(enviado_at) ultimo FROM RecordatoriosReenganche WHERE estado='enviado' GROUP BY user_id`),
  ]);

  const chatMap = {}, firstChatMap = {}, firstActMap = {}, remMap = {};
  for (const c of chatAgg) { const k = normalizarTelefono(c.wa_id); if (k) chatMap[k] = c; }
  for (const c of firstChat) { const k = normalizarTelefono(c.wa_id); if (k) firstChatMap[k] = c.first_chat; }
  for (const f of firstAct) firstActMap[f.user_id] = f.first_activity;
  for (const r of rem) remMap[r.user_id] = r.ultimo;

  const now = Date.now();
  const out = usuarios.map(u => {
    const key = u.telefono ? normalizarTelefono(u.telefono) : null;
    const chat = key ? chatMap[key] : null;
    const ultima = chat ? chat.ultima : null;
    const total = chat ? Number(chat.total) : 0;
    const candidatos = [firstActMap[u.id], key ? firstChatMap[key] : null]
      .filter(Boolean).map(d => new Date(d).getTime());
    const alta = candidatos.length ? new Date(Math.min(...candidatos)).toISOString() : null;
    const dias_inactivo = ultima ? Math.floor((now - new Date(ultima).getTime()) / 86400000) : null;
    const ultimo_recordatorio = remMap[u.id] || null;
    const reenganchado = !!(ultimo_recordatorio && ultima &&
      new Date(ultima).getTime() > new Date(ultimo_recordatorio).getTime());
    return {
      id: u.id, username: u.username, email: u.email, telefono: u.telefono,
      has_completed_onboarding: u.has_completed_onboarding, is_admin: u.is_admin,
      primera_actividad: alta, ultima_interaccion: ultima, dias_inactivo,
      total_mensajes: total, ultimo_recordatorio, reenganchado
    };
  });
  out.sort((a, b) => (b.dias_inactivo ?? 99999) - (a.dias_inactivo ?? 99999));
  return out;
}

// Envía el template de re-enganche a un usuario y registra el resultado.
async function enviarRecordatorio(u) {
  const to = normalizarTelefono(u.telefono);
  try {
    const data = await sendTemplate({
      to, templateName: REENGAGE_TEMPLATE, languageCode: REENGAGE_LANG,
      bodyParams: [u.username || 'amig@']
    });
    const waId = data && data.messages && data.messages[0] && data.messages[0].id;
    await db.RecordatoriosReenganche.create({
      user_id: u.id, enviado_at: new Date(), template: REENGAGE_TEMPLATE,
      estado: 'enviado', wa_message_id: waId || null
    });
    return { ok: true, estado: 'enviado', user_id: u.id, wa_message_id: waId || null };
  } catch (err) {
    const msg = err.response && err.response.data ? JSON.stringify(err.response.data) : err.message;
    await db.RecordatoriosReenganche.create({
      user_id: u.id, enviado_at: new Date(), template: REENGAGE_TEMPLATE,
      estado: 'error', error: String(msg).slice(0, 1000)
    });
    return { ok: false, estado: 'error', user_id: u.id, error: msg };
  }
}

// GET /api/admin/usuarios — lista completa con métricas de actividad.
router.get('/usuarios', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const usuarios = await buildUsuariosResumen();
    res.json({ generado: new Date().toISOString(), total: usuarios.length, usuarios });
  } catch (err) {
    console.error('[admin/usuarios] error:', err);
    res.status(500).json({ message: 'Error obteniendo usuarios' });
  }
});

// GET /api/admin/usuarios/:id/timeline — historial de un usuario.
router.get('/usuarios/:id/timeline', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const u = await db.Usuarios.findByPk(id);
    if (!u) return res.status(404).json({ message: 'Usuario no encontrado' });

    let mensajes = [];
    if (u.telefono) {
      const variantes = obtenerVariantesTelefono(u.telefono);
      if (variantes.length) {
        mensajes = await q(
          `SELECT role, LEFT(content, 140) contenido, created_at
           FROM ChatMessages WHERE wa_id IN (:v) ORDER BY created_at ASC LIMIT 300`,
          { v: variantes }
        );
      }
    }
    const fa = await q(
      `SELECT MIN(d) alta FROM (
         SELECT DATE(fecha) d FROM Gastos WHERE usuario_id = :id
         UNION ALL SELECT DATE(created_at) d FROM Movimientos WHERE user_id = :id
       ) t`, { id });
    let alta = fa[0] && fa[0].alta ? new Date(fa[0].alta).getTime() : null;
    if (mensajes.length) {
      const fc = new Date(mensajes[0].created_at).getTime();
      alta = alta ? Math.min(alta, fc) : fc;
    }
    const recordatorios = await q(
      `SELECT enviado_at, estado FROM RecordatoriosReenganche WHERE user_id = :id ORDER BY enviado_at ASC`,
      { id });

    res.json({
      usuario: { id: u.id, username: u.username, email: u.email, telefono: u.telefono },
      alta: alta ? new Date(alta).toISOString() : null,
      total_mensajes: mensajes.filter(m => m.role === 'user').length,
      mensajes, recordatorios
    });
  } catch (err) {
    console.error('[admin/usuarios/timeline] error:', err);
    res.status(500).json({ message: 'Error obteniendo timeline' });
  }
});

// POST /api/admin/usuarios/:id/recordatorio — envía el template a un usuario.
router.post('/usuarios/:id/recordatorio', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const u = await db.Usuarios.findByPk(id);
    if (!u) return res.status(404).json({ message: 'Usuario no encontrado' });
    if (!u.telefono) return res.status(400).json({ message: 'El usuario no tiene teléfono' });
    const r = await enviarRecordatorio(u);
    if (r.estado === 'error') return res.status(502).json(r);
    res.json(r);
  } catch (err) {
    console.error('[admin/recordatorio] error:', err);
    res.status(500).json({ message: 'Error enviando recordatorio' });
  }
});

// POST /api/admin/usuarios/recordatorio-masivo { dias } — a todos los inactivos >= dias (no admins).
router.post('/usuarios/recordatorio-masivo', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const dias = Math.max(0, parseInt(req.body && req.body.dias, 10) || 0);
    const resumen = await buildUsuariosResumen();
    const targetsResumen = resumen.filter(u =>
      u.telefono && !u.is_admin && (u.dias_inactivo === null || u.dias_inactivo >= dias));

    let enviados = 0, errores = 0;
    const detalle = [];
    for (const t of targetsResumen) {
      const u = await db.Usuarios.findByPk(t.id);
      const r = await enviarRecordatorio(u);
      if (r.estado === 'enviado') enviados++; else errores++;
      detalle.push({ user_id: t.id, username: t.username, estado: r.estado, error: r.error });
    }
    res.json({ dias, total: targetsResumen.length, enviados, errores, detalle });
  } catch (err) {
    console.error('[admin/recordatorio-masivo] error:', err);
    res.status(500).json({ message: 'Error en envío masivo' });
  }
});

module.exports = router;
