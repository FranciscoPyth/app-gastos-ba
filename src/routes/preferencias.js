const express = require('express');
const router = express.Router();
const { Usuarios, UsuarioTelefonos, Categorias, Divisas, TiposTransacciones, MetodosPagos } = require('../models');
const { normalizarTelefono, obtenerVariantesTelefono } = require('../utils/phoneUtils');
const { Op } = require('sequelize');
const apiKeyMiddleware = require('../security/apiKey');

/**
 * GET /api/preferencias/por-telefono/:telefono
 * Returns all preferences (categories, currencies, etc.) for a user identified by phone number.
 */
router.get('/por-telefono/:telefono', apiKeyMiddleware, async (req, res) => {
    try {
        const { telefono } = req.params;
        const variantes = obtenerVariantesTelefono(telefono);

        // 1. Find user by primary phone or additional phones
        let user = await Usuarios.findOne({
            where: {
                telefono: { [Op.in]: variantes }
            }
        });

        if (!user) {
            const adicional = await UsuarioTelefonos.findOne({
                where: { telefono: { [Op.in]: variantes } },
                include: [{ model: Usuarios, as: 'Usuario' }] // Assuming association exists
            });
            if (adicional) {
                user = adicional.Usuario;
            }
        }

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado con ese número de teléfono' });
        }

        const usuario_id = user.id;

        // 2. Fetch all preferences in parallel
        const [categorias, divisas, tipos, medios] = await Promise.all([
            Categorias.findAll({ where: { usuario_id }, order: [['descripcion', 'ASC']] }),
            Divisas.findAll({ where: { usuario_id }, order: [['descripcion', 'ASC']] }),
            TiposTransacciones.findAll({ where: { usuario_id }, order: [['descripcion', 'ASC']] }),
            MetodosPagos.findAll({ where: { usuario_id }, order: [['descripcion', 'ASC']] })
        ]);

        // 3. Simple list of strings for n8n ease of use
        res.json({
            usuario: {
                id: user.id,
                username: user.username,
                email: user.email,
                telefonoPrincipal: user.telefono
            },
            preferencias: {
                categorias: categorias.map(c => c.descripcion),
                divisas: divisas.map(d => d.descripcion),
                tipos_transaccion: tipos.map(t => t.descripcion),
                medios_pago: medios.map(m => m.descripcion)
            }
        });

    } catch (error) {
        console.error('[ERROR] Error fetching preferences by phone:', error);
        res.status(500).json({ error: 'Error interno del servidor', detail: error.message });
    }
});

module.exports = router;
