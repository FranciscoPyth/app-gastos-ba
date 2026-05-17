const express = require("express");
const router = express.Router();
const { Objetivos, Movimientos } = require("../models");
const { authenticateJWT } = require("../security/auth");
const { registrarMovimientoObjetivo } = require("../utils/movimientos");

// GET
router.get("/", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const objetivos = await Objetivos.findAll({
            where: { user_id: userId },
            order: [["created_at", "DESC"]]
        });
        res.json(objetivos);
    } catch (error) {
        console.error("Error al obtener objetivos:", error);
        res.status(500).json({ error: error.message });
    }
});

// POST
router.post("/", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const { nombre, monto_objetivo, monto_actual, divisa, fecha_limite, descripcion } = req.body;

        if (!nombre || !monto_objetivo) {
            return res.status(400).json({ error: "Nombre y monto objetivo son requeridos" });
        }

        const nuevoObjetivo = await Objetivos.create({
            nombre,
            monto_objetivo: parseFloat(monto_objetivo),
            monto_actual: monto_actual ? parseFloat(monto_actual) : 0,
            divisa: divisa || "ARS",
            fecha_limite: fecha_limite || null,
            descripcion: descripcion || "",
            estado: "activa",
            user_id: userId
        });

        res.status(201).json(nuevoObjetivo);
    } catch (error) {
        console.error("Error al crear objetivo:", error);
        res.status(500).json({ error: error.message });
    }
});

// PUT
router.put("/:id", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const { id } = req.params;
        const objetivo = await Objetivos.findOne({ where: { id, user_id: userId } });
        if (!objetivo) return res.status(404).json({ error: "Objetivo no encontrado" });

        const editable = ["nombre", "monto_objetivo", "divisa", "fecha_limite", "descripcion", "estado"];
        const updates = {};
        for (const k of editable) if (k in req.body) updates[k] = req.body[k];

        await objetivo.update(updates);
        res.json(objetivo);
    } catch (error) {
        console.error("Error al actualizar objetivo:", error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /:id/abonar — aportar al objetivo (tipo=aporte por default, o retiro)
router.put("/:id/abonar", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const { id } = req.params;
        const { monto, fecha, tipo } = req.body;

        const objetivo = await Objetivos.findOne({ where: { id, user_id: userId } });
        if (!objetivo) return res.status(404).json({ error: "Objetivo no encontrado" });

        const result = await registrarMovimientoObjetivo({
            objetivo,
            monto,
            fecha,
            numero_cel: res.locals.user.telefono,
            tipo: tipo === "retiro" ? "retiro" : "aporte"
        });

        res.json({ objetivo: result.objetivo, movimiento: result.movimiento });
    } catch (error) {
        console.error("Error al registrar movimiento:", error);
        res.status(400).json({ error: error.message });
    }
});

// GET /:id/movimientos
router.get("/:id/movimientos", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const { id } = req.params;
        const objetivo = await Objetivos.findOne({ where: { id, user_id: userId } });
        if (!objetivo) return res.status(404).json({ error: "Objetivo no encontrado" });

        const movimientos = await Movimientos.findAll({
            where: { user_id: userId, entidad_tipo: "objetivo", entidad_id: id },
            order: [["fecha", "DESC"], ["id", "DESC"]]
        });
        res.json(movimientos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE
router.delete("/:id", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const { id } = req.params;
        const objetivo = await Objetivos.findOne({ where: { id, user_id: userId } });
        if (!objetivo) return res.status(404).json({ error: "Objetivo no encontrado" });
        await objetivo.destroy();
        res.status(204).send();
    } catch (error) {
        console.error("Error al eliminar objetivo:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
