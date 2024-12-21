const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Usuarios } = require('../models');
const { accessTokenSecret } = require('../security/auth'); // Asegúrate de tener una configuración para el secret del token

router.post('/', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await Usuarios.findOne({ where: { username } });

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Verificar la contraseña
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Contraseña incorrecta' });
    }

    // Crear un token JWT
    const token = jwt.sign({ id: user.id, username: user.username }, accessTokenSecret, {
      expiresIn: '20m', // Ajusta el tiempo de expiración según tus necesidades
    });

    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: 'Error al iniciar sesión', error });
  }
});


module.exports = router;
