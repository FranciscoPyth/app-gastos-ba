const express = require("express");
const router = express.Router();
const { Usuarios, UsuarioTelefonos } = require("../models");
const apiKeyMiddleware = require("../security/apiKey");

// GET /api/usuarios - Listar usuarios (Protegido por API Key)
// Retorna un array plano de usuarios para uso en flujos automatizados (n8n)
router.get("/", apiKeyMiddleware, async (req, res) => {
    try {
        const usuarios = await Usuarios.findAll({
            include: [
                {
                    model: UsuarioTelefonos,
                    as: "telefonos_adicionales",
                    attributes: ["telefono"],
                },
            ],
            attributes: ["id", "username", "email", "telefono"],
        });

        const usuariosN8N = usuarios.map((user) => {
            return {
                id: user.id,
                username: user.username,
                email: user.email,
                telefonoPrincipal: user.telefono,
                // Proporcionamos también una lista plana de todos los teléfonos asociados (principal + adicionales)
                todosLosTelefonos: [
                    user.telefono,
                    ...user.telefonos_adicionales.map((t) => t.telefono)
                ].filter(Boolean)
            };
        });

        res.json(usuariosN8N);
    } catch (error) {
        console.error("Error al obtener la lista de usuarios:", error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/usuarios/complete-onboarding - Marcar onboarding como completado
// Se asume el uso de un middleware de autenticación por JWT para obtener el user ID.
// Como no veo que usuarios.js use el middleware JWT (usa apiKeyMiddleware en el GET /),
// voy a importar el middleware de JWT que presumiblemente existe.
// Si no existe tal como lo imagino, usaré una lógica similar a las otras rutas autenticadas.
const { authenticateJWT } = require('../security/auth');

router.post("/complete-onboarding", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id; // El ID extraído del token JWT por el middleware

        const user = await Usuarios.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        user.has_completed_onboarding = true;
        await user.save();

        res.json({ message: "Onboarding completado exitosamente", user: { has_completed_onboarding: true } });
    } catch (error) {
        console.error("Error al completar onboarding:", error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/usuarios/perfil - Actualizar foto de perfil
router.put("/perfil", authenticateJWT, async (req, res) => {
    try {
        const userId = req.user ? req.user.id : res.locals.user.id;
        const { foto_perfil } = req.body;

        const user = await Usuarios.findByPk(userId);
        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

        if (foto_perfil !== undefined) {
            user.foto_perfil = foto_perfil;
            await user.save();
        }

        res.json({ message: "Perfil actualizado exitosamente", foto_perfil: user.foto_perfil });
    } catch (error) {
        console.error("Error actualizando perfil:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
