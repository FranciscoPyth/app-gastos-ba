const express = require('express');
const axios = require('axios');
const router = express.Router();
const { PhoneVerifications, UsuarioTelefonos, Usuarios } = require('../models');
const { authenticateJWT } = require('../security/auth');
const { Op } = require('sequelize');

// Middleware de autenticación para todas las rutas
router.use(authenticateJWT);

// Helper para normalizar teléfono (Formato 549XXXXXXXXXX)
const normalizarTelefono = (numero) => {
    if (!numero) return null;
    let numeroLimpio = numero.toString().replace(/\D/g, '');

    // Si ya empieza con 549, lo dejamos así
    if (numeroLimpio.startsWith('549')) {
        return numeroLimpio;
    }

    // Si empieza con 54 y NO tiene el 9 (ej: 5411...), le agregamos el 9? 
    // Para Argentina móviles es 54 9 + área + número.
    // Si el usuario manda 54351... asumimos que es móvil y le falta el 9? 
    // O si manda sin prefijo internacional...

    // CASO 1: Empieza con 54, pero no sigue con 9 (ej: 54351...) -> Agregar 9 después del 54
    if (numeroLimpio.startsWith('54') && !numeroLimpio.startsWith('549')) {
        return '549' + numeroLimpio.substring(2);
    }

    // CASO 2: No tiene el prefijo de país (ej: 351...) -> Agregar 549
    if (!numeroLimpio.startsWith('54')) {
        return '549' + numeroLimpio;
    }

    return numeroLimpio;
};

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

        // Enviar código al Webhook de n8n para envío por WhatsApp
        try {
            await axios.post('https://vps-4600756-x.dattaweb.com/n8n/webhook/fafb793d-a7d1-4b11-885f-53a4bdb8194e', {
                recipient_phone: telefonoNormalizado,
                code: codigo
            });
            console.log(`Código de verificación enviado a n8n para ${telefonoNormalizado}`);
        } catch (webhookError) {
            console.error('Error al enviar código a n8n:', webhookError.message);
            // No bloqueamos el flujo, pero logueamos el error
        }

        res.json({
            message: 'Código de verificación generado y enviado por WhatsApp. Por favor revisa tu mensajes.'
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

        // Código válido: Agregar a UsuarioTelefonos
        await UsuarioTelefonos.create({
            usuario_id: userId,
            telefono: telefonoNormalizado
        });

        // Borrar la verificación usada
        await verification.destroy();

        res.json({ message: 'Teléfono verificado y agregado exitosamente' });

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
