// Middleware: exige que el usuario autenticado sea admin de plataforma.
// Verifica is_admin contra la DB (no confía en el claim del token).
// Debe usarse SIEMPRE después de authenticateJWT.
const db = require('../models');

const requireAdmin = async (req, res, next) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ message: 'Acceso denegado' });

    const user = await db.Usuarios.findByPk(userId, { attributes: ['id', 'is_admin'] });
    if (!user || !user.is_admin) {
      return res.status(403).json({ message: 'Acceso restringido a administradores' });
    }
    next();
  } catch (err) {
    console.error('[requireAdmin] error:', err);
    res.status(500).json({ message: 'Error verificando permisos' });
  }
};

module.exports = requireAdmin;
