const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Usuarios } = require('../models');
const { Op } = require('sequelize');
const { accessTokenSecret } = require('../security/auth');
const { normalizarTelefono, obtenerVariantesTelefono } = require('../utils/phoneUtils');

router.post('/', async (req, res) => {
  // Aceptamos 'identifier' que puede ser username, email o teléfono
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ message: 'Identificador y contraseña son requeridos' });
  }

  try {
    const phoneVariants = obtenerVariantesTelefono(identifier);

    // Buscar usuario por username, email o teléfono
    const user = await Usuarios.findOne({
      where: {
        [Op.or]: [
          { username: identifier },
          { email: identifier },
          { telefono: { [Op.in]: phoneVariants } }
        ]
      }
    });

    if (!user) {
      // Usar mensaje genérico para evitar enumeración de usuarios
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // Verificar la contraseña
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // Crear un token JWT
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        telefono: user.telefono
      },
      accessTokenSecret,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login exitoso',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        telefono: user.telefono,
        foto_perfil: user.foto_perfil,
        has_completed_onboarding: user.has_completed_onboarding
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ message: 'Error al iniciar sesión', error: error.message });
  }
});

module.exports = router;
