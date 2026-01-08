const express = require("express");
const router = express.Router();
const { Prestamos } = require("../models");
const { authenticateJWT } = require("../security/auth");

// GET: Obtener prestamos
router.get("/", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const prestamos = await Prestamos.findAll({
            where: { user_id: userId }
        });
        res.json(prestamos);
    } catch (error) {
        console.error("Error al obtener prestamos:", error);
        res.status(500).json({ error: error.message });
    }
});

// POST: Crear prestamo
router.post("/", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const nuevoPrestamo = await Prestamos.create({
            ...req.body,
            user_id: userId
        });
        res.status(201).json(nuevoPrestamo);
    } catch (error) {
        console.error("Error al crear prestamo:", error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE
router.delete("/:id", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const { id } = req.params;
        const prestamo = await Prestamos.findOne({ where: { id, user_id: userId } });
        if (!prestamo) return res.status(404).json({ error: "No encontrado" });
        await prestamo.destroy();
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
