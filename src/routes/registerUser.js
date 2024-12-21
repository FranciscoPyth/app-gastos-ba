// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { Usuarios } = require('../models');

// Ruta para registrar un nuevo usuario
router.post('/', async (req, res) => {
  const { username, password, email } = req.body;

  // Verificar que el nombre de usuario, la contraseña y el email estén presentes
  if (!username || !password || !email) {
    return res.status(400).json({ message: 'Nombre de usuario, contraseña y email son requeridos' });
  }

  try {
    // Verificar si el usuario ya existe
    const existingUser = await Usuarios.findOne({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ message: 'Nombre de usuario ya existe' });
    }

    // Encriptar la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear el nuevo usuario
    const newUser = await Usuarios.create({
      username,
      password: hashedPassword,
      email
    });

    res.status(201).json({ message: 'Usuario registrado exitosamente', userId: newUser.id });
  } catch (error) {
    console.error('Error al registrar el usuario:', error);
    res.status(500).json({ message: 'Error al registrar el usuario', error });
  }
});

module.exports = router;
