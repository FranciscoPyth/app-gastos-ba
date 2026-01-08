const express = require("express");
const router = express.Router();
const { Deudas } = require("../models");
const { authenticateJWT } = require("../security/auth");

// GET
router.get("/", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const deudas = await Deudas.findAll({ where: { user_id: userId } });
        res.json(deudas);
    } catch (error) {
        console.error("Error al obtener deudas:", error);
        res.status(500).json({ error: error.message });
    }
});

// POST
router.post("/", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const nuevaDeuda = await Deudas.create({
            ...req.body,
            user_id: userId
        });
        res.status(201).json(nuevaDeuda);
    } catch (error) {
        console.error("Error al crear deuda:", error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE
router.delete("/:id", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const { id } = req.params;
        const deuda = await Deudas.findOne({ where: { id, user_id: userId } });
        if (!deuda) return res.status(404).json({ error: "No encontrada" });
        await deuda.destroy();
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT
router.put("/:id", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const { id } = req.params;
        const deuda = await Deudas.findOne({ where: { id, user_id: userId } });

        if (!deuda) {
            return res.status(404).json({ error: "Deuda no encontrada o no autorizada" });
        }

        await deuda.update(req.body);
        res.json(deuda);
    } catch (error) {
        console.error("Error al actualizar deuda:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
