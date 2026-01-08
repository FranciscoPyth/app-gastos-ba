const express = require("express");
const router = express.Router();
const { Objetivos } = require("../models");
const { authenticateJWT } = require("../security/auth");

// GET: Obtener objetivos del usuario autenticado
router.get("/", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const objetivos = await Objetivos.findAll({
            where: { user_id: userId }
        });
        res.json(objetivos);
    } catch (error) {
        console.error("Error al obtener objetivos:", error);
        res.status(500).json({ error: error.message });
    }
});

// POST: Crear nuevo objetivo
router.post("/", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const { nombre, monto_objetivo, monto_actual, fecha_limite, descripcion } = req.body;

        if (!nombre || !monto_objetivo) {
            return res.status(400).json({ error: "Nombre y monto objetivo son requeridos" });
        }

        const nuevoObjetivo = await Objetivos.create({
            nombre,
            monto_objetivo,
            monto_actual: monto_actual || 0,
            fecha_limite,
            descripcion,
            user_id: userId
        });

        res.status(201).json(nuevoObjetivo);
    } catch (error) {
        console.error("Error al crear objetivo:", error);
        res.status(500).json({ error: error.message });
    }
});

// PUT: Actualizar objetivo
router.put("/:id", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const { id } = req.params;

        const objetivo = await Objetivos.findOne({
            where: { id, user_id: userId }
        });

        if (!objetivo) {
            return res.status(404).json({ error: "Objetivo no encontrado" });
        }

        const updatedObjetivo = await objetivo.update(req.body);
        res.json(updatedObjetivo);
    } catch (error) {
        console.error("Error al actualizar objetivo:", error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE: Eliminar objetivo
router.delete("/:id", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const { id } = req.params;

        const objetivo = await Objetivos.findOne({
            where: { id, user_id: userId }
        });

        if (!objetivo) {
            return res.status(404).json({ error: "Objetivo no encontrado" });
        }

        await objetivo.destroy();
        res.status(204).send();
    } catch (error) {
        console.error("Error al eliminar objetivo:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
