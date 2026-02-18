const express = require('express');
const axios = require('axios');
const router = express.Router();
const { PhoneVerifications, UsuarioTelefonos, Usuarios } = require('../models');
const { authenticateJWT } = require('../security/auth');
const { Op } = require('sequelize');

// Middleware de autenticación para todas las rutas
router.use(authenticateJWT);

const { normalizarTelefono } = require('../utils/phoneUtils');



// POST: Solicitar verificación de teléfono
router.post('/request-verification', async (req, res) => {
    try {
        const { telefono } = req.body;
        const userId = res.locals.user.id;

        if (!telefono) {
            return res.status(400).json({ message: 'El teléfono es requerido' });
        }

        const telefonoNormalizado = normalizarTelefono(telefono);

        // Verificar si ya existe en UsuarioTelefonos o en Usuarios (principal)
        const existePrincipal = await Usuarios.findOne({
            where: {
                telefono: telefonoNormalizado,
                id: { [Op.ne]: userId } // Que no sea el mismo usuario (aunque si ya lo tiene, para qué agregarlo?)
            }
        });

        const existeAdicional = await UsuarioTelefonos.findOne({ where: { telefono: telefonoNormalizado } });

        if (existePrincipal || existeAdicional) {
            // Aquí podrías decidir si permites que un número esté en varias cuentas o no.
            // Por seguridad, generalmente no se permite.
            return res.status(400).json({ message: 'Este número de teléfono ya está asociado a una cuenta.' });
        }

        // Verificar si el usuario ya tiene ese número
        const user = await Usuarios.findByPk(userId);
        if (user.telefono === telefonoNormalizado) {
            return res.status(400).json({ message: 'Ya tienes este número registrado como principal.' });
        }

        const userPhone = await UsuarioTelefonos.findOne({
            where: { usuario_id: userId, telefono: telefonoNormalizado }
        });

        if (userPhone) {
            return res.status(400).json({ message: 'Ya tienes este número registrado.' });
        }

        // Generar código de 6 dígitos
        const codigo = Math.floor(100000 + Math.random() * 900000).toString();

        // Expiración en 15 minutos
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 15);

        // Guardar o actualizar verificación pendiente
        // Borramos anteriores para este usuario y teléfono para no acumular basura
        await PhoneVerifications.destroy({
            where: { usuario_id: userId, telefono: telefonoNormalizado }
        });

        await PhoneVerifications.create({
            usuario_id: userId,
            telefono: telefonoNormalizado,
            codigo: codigo,
            expires_at: expiresAt
        });

        // Enviar por WhatsApp (Meta Cloud API)
        const whatsappToken = process.env.WHATSAPP_TOKEN;
        const whatsappPhoneId = process.env.WHATSAPP_PHONE_ID;

        if (!whatsappToken || !whatsappPhoneId) {
            console.warn('[WARNING] WhatsApp credentials not configured.');
        } else {
            const whatsappUrl = `https://graph.facebook.com/v21.0/${whatsappPhoneId}/messages`;

            // Template específico
            const specificTemplateName = 'template_ccontrolalo_login_v1';
            const specificTemplateLang = 'es_AR';

            const messagePayload = {
                messaging_product: 'whatsapp',
                to: telefonoNormalizado,
                type: 'template',
                template: {
                    name: specificTemplateName,
                    language: { code: specificTemplateLang },
                    components: [
                        {
                            type: 'body',
                            parameters: [{ type: 'text', text: codigo }]
                        },
                        {
                            type: 'button',
                            sub_type: 'url',
                            index: 0,
                            parameters: [{ type: 'text', text: codigo }]
                        }
                    ]
                }
            };

            try {
                await axios.post(whatsappUrl, messagePayload, {
                    headers: {
                        'Authorization': `Bearer ${whatsappToken}`,
                        'Content-Type': 'application/json'
                    }
                });
                console.log(`Código de verificación enviado a ${telefonoNormalizado} via Meta Cloud API`);
            } catch (waError) {
                console.error('[ERROR] Error al enviar mensaje a WhatsApp:', waError.message);
                if (waError.response) {
                    console.error('[ERROR] Meta Response:', JSON.stringify(waError.response.data));
                }
            }
        }

        res.json({
            message: 'Código de verificación enviado por WhatsApp.',
            requires_interaction: false
        });

    } catch (error) {
        console.error('Error al solicitar verificación:', error);
        res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    }
});

// POST: Confirmar verificación y agregar teléfono
router.post('/verify', async (req, res) => {
    try {
        const { telefono, codigo } = req.body;
        const userId = res.locals.user.id;

        if (!telefono || !codigo) {
            return res.status(400).json({ message: 'Teléfono y código son requeridos' });
        }

        const telefonoNormalizado = normalizarTelefono(telefono);

        // Buscar la verificación
        const verification = await PhoneVerifications.findOne({
            where: {
                usuario_id: userId,
                telefono: telefonoNormalizado,
                codigo: codigo,
                expires_at: { [Op.gt]: new Date() } // Que no haya expirado
            }
        });

        if (!verification) {
            return res.status(400).json({ message: 'Código inválido o expirado' });
        }

        // Obtener al usuario para ver si tiene ya un teléfono principal
        const user = await Usuarios.findByPk(userId);

        if (!user.telefono) {
            // CASO A: Usuario no tiene teléfono principal (ej: Google Login) -> Asignar como principal
            user.telefono = telefonoNormalizado;
            await user.save();

            // Borrar la verificación usada
            await verification.destroy();

            return res.json({
                message: 'Teléfono principal vinculado exitosamente',
                isPrimary: true,
                telefono: telefonoNormalizado
            });
        } else {
            // CASO B: Usuario ya tiene teléfono principal -> Agregar como adicional

            // Verificar si ya existe en adicionales (aunque request-verification ya lo chequea, doble seguridad)
            const exists = await UsuarioTelefonos.findOne({
                where: { usuario_id: userId, telefono: telefonoNormalizado }
            });

            if (!exists) {
                await UsuarioTelefonos.create({
                    usuario_id: userId,
                    telefono: telefonoNormalizado
                });
            }

            // Borrar la verificación usada
            await verification.destroy();

            return res.json({
                message: 'Teléfono adicional agregado exitosamente',
                isPrimary: false,
                telefono: telefonoNormalizado
            });
        }

    } catch (error) {
        console.error('Error al verificar código:', error);
        res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    }
});

// GET: Listar teléfonos del usuario
router.get('/', async (req, res) => {
    try {
        const userId = res.locals.user.id;

        const usuario = await Usuarios.findByPk(userId, {
            attributes: ['telefono']
        });

        const adicionales = await UsuarioTelefonos.findAll({
            where: { usuario_id: userId },
            attributes: ['id', 'telefono']
        });

        res.json({
            principal: usuario.telefono,
            adicionales: adicionales
        });

    } catch (error) {
        console.error('Error al listar teléfonos:', error);
        res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    }
});

// DELETE: Eliminar un teléfono adicional
router.delete('/:id', async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const id = req.params.id;

        const telefono = await UsuarioTelefonos.findOne({
            where: { id: id, usuario_id: userId }
        });

        if (!telefono) {
            return res.status(404).json({ message: 'Teléfono no encontrado' });
        }

        await telefono.destroy();

        res.json({ message: 'Teléfono eliminado correctamente' });

    } catch (error) {
        console.error('Error al eliminar teléfono:', error);
        res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    }
});

module.exports = router;
