// routes/registerUser.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { Usuarios } = require('../models');
const Joi = require('joi');
const { PhoneNumberUtil, PhoneNumberFormat } = require('google-libphonenumber');

const phoneUtil = PhoneNumberUtil.getInstance();

// Esquema de validación con Joi
const schema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string().min(6).required(),
  email: Joi.string().email().required(),
  telefono: Joi.string().required(),
  pais: Joi.string().length(2).uppercase().default('AR') // Código de país ISO 3166-1 alpha-2 (ej: AR, US, ES)
});

// Ruta para registrar un nuevo usuario
router.post('/', async (req, res) => {
  try {
    // 1. Validar datos de entrada
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { username, password, email, telefono, pais } = value;

    // 2. Validar número de teléfono y región
    let numeroNormalizado;
    try {
      const number = phoneUtil.parseAndKeepRawInput(telefono, pais);

      if (!phoneUtil.isValidNumber(number)) {
        return res.status(400).json({ message: `El número de teléfono no es válido para la región ${pais}` });
      }

      // Formatear a E.164 (estándar internacional: +54911...)
      numeroNormalizado = phoneUtil.format(number, PhoneNumberFormat.E164);

    } catch (e) {
      return res.status(400).json({ message: 'Error al procesar el número de teléfono. Verifique el formato.' });
    }

    // 3. Verificar si el usuario ya existe (username, email o teléfono)
    const existingUser = await Usuarios.findOne({
      where: {
        [require('sequelize').Op.or]: [
          { username },
          { email },
          { telefono: numeroNormalizado }
        ]
      }
    });

    if (existingUser) {
      let msg = 'El usuario ya existe';
      if (existingUser.username === username) msg = 'El nombre de usuario ya está en uso';
      if (existingUser.email === email) msg = 'El email ya está registrado';
      if (existingUser.telefono === numeroNormalizado) msg = 'El número de teléfono ya está registrado';
      return res.status(400).json({ message: msg });
    }

    // 4. Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // 5. Crear usuario
    const newUser = await Usuarios.create({
      username,
      password: hashedPassword,
      email,
      telefono: numeroNormalizado
    });

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      userId: newUser.id,
      telefono_registrado: numeroNormalizado
    });

  } catch (error) {
    console.error('Error al registrar el usuario:', error);
    res.status(500).json({ message: 'Error interno del servidor', error: error.message });
  }
});

module.exports = router;
