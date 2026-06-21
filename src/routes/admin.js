// Panel de administración de plataforma (solo cuentas is_admin).
// GET /api/admin/metrics  -> métricas agregadas de todo el producto.
const express = require('express');
const router = express.Router();
const db = require('../models');
const { authenticateJWT } = require('../security/auth');
const requireAdmin = require('../security/requireAdmin');

const QueryTypes = db.Sequelize.QueryTypes;
const q = (sql, replacements) =>
  db.sequelize.query(sql, { type: QueryTypes.SELECT, replacements });

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

module.exports = router;
