// routes/registerUser.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { Usuarios, PhoneVerifications, UsuarioTelefonos } = require('../models');
const Joi = require('joi');
const axios = require('axios');
const { PhoneNumberUtil, PhoneNumberFormat } = require('google-libphonenumber');

const phoneUtil = PhoneNumberUtil.getInstance();

// Esquema de validación con Joi
const schema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string().min(6).required(),
  email: Joi.string().email().required(),
  telefono: Joi.string().required(),
  pais: Joi.string().length(2).uppercase().default('AR'), // Código de país ISO 3166-1 alpha-2 (ej: AR, US, ES)
  verificationCode: Joi.string().length(6).required()
});

const verificationSchema = Joi.object({
  telefono: Joi.string().required(),
  pais: Joi.string().length(2).uppercase().default('AR')
});

// Ruta para iniciar verificación
router.post('/init-verification', async (req, res) => {
  try {
    const { error, value } = verificationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { telefono, pais } = value;
    let numeroNormalizado;

    try {
      const number = phoneUtil.parseAndKeepRawInput(telefono, pais);
      if (!phoneUtil.isValidNumber(number)) {
        return res.status(400).json({ message: `El número de teléfono no es válido para la región ${pais}` });
      }
      numeroNormalizado = phoneUtil.format(number, PhoneNumberFormat.E164).replace('+', '');
    } catch (e) {
      return res.status(400).json({ message: 'Error al procesar el número de teléfono. Verifique el formato.' });
    }

    // Verificar si ya existe en Usuarios o UsuarioTelefonos
    const existingUser = await Usuarios.findOne({ where: { telefono: numeroNormalizado } });
    const existingPhone = await UsuarioTelefonos.findOne({ where: { telefono: numeroNormalizado } });

    if (existingUser || existingPhone) {
      return res.status(400).json({ message: 'El número de teléfono ya está registrado' });
    }

    // Generar código de 6 dígitos
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();

    // Expiración en 15 minutos
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    // Guardar verficación (borrando anteriores para este teléfono)
    await PhoneVerifications.destroy({ where: { telefono: numeroNormalizado } });

    await PhoneVerifications.create({
      telefono: numeroNormalizado,
      codigo: codigo,
      expires_at: expiresAt,
      usuario_id: null
    });

    // Enviar por WhatsApp (Webhook n8n)
    // Enviar por WhatsApp (Meta Cloud API)
    const whatsappToken = process.env.WHATSAPP_TOKEN;
    const whatsappPhoneId = process.env.WHATSAPP_PHONE_ID;
    const whatsappTemplateName = process.env.WHATSAPP_TEMPLATE_NAME; // e.g. 'auth_matrix'
    const whatsappTemplateLang = process.env.WHATSAPP_TEMPLATE_LANG || 'es_AR';

    if (!whatsappToken || !whatsappPhoneId) {
      console.warn('[WARNING] WhatsApp credentials (WHATSAPP_TOKEN, WHATSAPP_PHONE_ID) not found in .env. Skipping message send.');
      console.warn('To enable WhatsApp messaging, add these variables to your .env file.');
    } else {
      const whatsappUrl = `https://graph.facebook.com/v21.0/${whatsappPhoneId}/messages`;

      let messagePayload = {};

      // Use the specific template requested by the user
      const specificTemplateName = 'template_ccontrolalo_login_v1';
      const specificTemplateLang = 'es_AR'; // Based on screenshot 'Spanish (ARG)'

      // Construct Payload for Authentication Template with Copy Code button
      messagePayload = {
        messaging_product: 'whatsapp',
        to: numeroNormalizado,
        type: 'template',
        template: {
          name: specificTemplateName,
          language: {
            code: specificTemplateLang
          },
          components: [
            {
              type: 'body',
              parameters: [
                {
                  type: 'text',
                  text: codigo
                }
              ]
            },
            {
              type: 'button',
              sub_type: 'url',
              index: 0,
              parameters: [
                {
                  type: 'text',
                  text: codigo
                }
              ]
            }
          ]
        }
      };

      console.log(`[DEBUG] Attempting to send WhatsApp message via Meta API to ${numeroNormalizado}`);
      // console.log(`[DEBUG] Payload:`, JSON.stringify(messagePayload)); // Uncomment for deep debug

      try {
        const waResponse = await axios.post(whatsappUrl, messagePayload, {
          headers: {
            'Authorization': `Bearer ${whatsappToken}`,
            'Content-Type': 'application/json'
          }
        });
        console.log(`[DEBUG] Response from Meta: Status ${waResponse.status}`, waResponse.data);
        console.log(`Código enviado a ${numeroNormalizado} via Meta Cloud API`);
      } catch (waError) {
        console.error('[ERROR] Error al enviar mensaje a WhatsApp:', waError.message);
        if (waError.response) {
          console.error('[ERROR] Meta Response Data:', JSON.stringify(waError.response.data));
          console.error('[ERROR] Meta Response Status:', waError.response.status);
        }
      }
    }

    res.json({
      message: 'Código de verificación enviado',
      requires_interaction: false // Always false now as we use a specific template
    });

  } catch (error) {
    console.error('Error al iniciar verificación:', error);
    res.status(500).json({ message: 'Error interno del servidor', error: error.message });
  }
});

// Ruta para registrar un nuevo usuario
router.post('/', async (req, res) => {
  try {
    // 1. Validar datos de entrada
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { username, password, email, telefono, pais, verificationCode } = value;

    // 2. Validar número de teléfono y región
    let numeroNormalizado;
    try {
      const number = phoneUtil.parseAndKeepRawInput(telefono, pais);

      if (!phoneUtil.isValidNumber(number)) {
        return res.status(400).json({ message: `El número de teléfono no es válido para la región ${pais}` });
      }

      // Formatear a E.164 (estándar internacional: +54911...)
      numeroNormalizado = phoneUtil.format(number, PhoneNumberFormat.E164).replace('+', '');

    } catch (e) {
      return res.status(400).json({ message: 'Error al procesar el número de teléfono. Verifique el formato.' });
    }

    // 3. VERIFICAR CODIGO
    const verification = await PhoneVerifications.findOne({
      where: {
        telefono: numeroNormalizado,
        codigo: verificationCode,
        expires_at: { [require('sequelize').Op.gt]: new Date() }
      }
    });

    if (!verification) {
      return res.status(400).json({ message: 'Código de verificación inválido o expirado' });
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

    // Borrar verificación usada
    await verification.destroy();

  } catch (error) {
    console.error('Error al registrar el usuario:', error);
    res.status(500).json({ message: 'Error interno del servidor', error: error.message });
  }
});

module.exports = router;
