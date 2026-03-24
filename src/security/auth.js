const jwt = require('jsonwebtoken');

const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET || 'youraccesstokensecret';
const refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET || 'yourrefreshtokensecrethere';

const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(' ')[1];

    jwt.verify(token, accessTokenSecret, (err, user) => {
      if (err) {
        return res.status(403).json({ message: 'Token no es válido' });
      }

      res.locals.user = user;
      req.user = user; // Asigna req.user para compatibilidad con auth combinada
      next();
    });
  } else {
    res.status(401).json({ message: 'Acceso denegado' });
  }
};

module.exports = { authenticateJWT, accessTokenSecret, refreshTokenSecret };
