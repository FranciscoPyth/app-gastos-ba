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

module.exports = router;
