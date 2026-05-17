const express = require("express");
const router = express.Router();
const { Prestamos, Movimientos } = require("../models");
const { authenticateJWT } = require("../security/auth");
const { registrarCobroPrestamo, registrarCreacionPrestamo } = require("../utils/movimientos");

// GET
router.get("/", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const prestamos = await Prestamos.findAll({
            where: { user_id: userId },
            order: [["created_at", "DESC"]]
        });
        res.json(prestamos);
    } catch (error) {
        console.error("Error al obtener prestamos:", error);
        res.status(500).json({ error: error.message });
    }
});

// POST: Crear préstamo
router.post("/", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const {
            nombre_persona,
            monto_original,
            monto,                // alias legacy
            divisa,
            fecha_prestamo,
            fecha_vencimiento,
            descripcion,
            estado
        } = req.body;

        const original = parseFloat(monto_original || monto);
        if (!nombre_persona || isNaN(original) || original <= 0) {
            return res.status(400).json({ error: "nombre_persona y monto_original son requeridos" });
        }

        const nuevoPrestamo = await Prestamos.create({
            user_id: userId,
            nombre_persona,
            monto_original: original,
            saldo_restante: original,
            divisa: divisa || "ARS",
            fecha_prestamo: fecha_prestamo || new Date(),
            fecha_vencimiento: fecha_vencimiento || null,
            descripcion: descripcion || "",
            estado: estado || "pendiente"
        });

        // Registrar movimiento de otorgamiento (egreso de plata)
        try {
            await registrarCreacionPrestamo(nuevoPrestamo, { numero_cel: res.locals.user.telefono });
        } catch (e) {
            console.error("[prestamos] no se pudo registrar movimiento de otorgamiento:", e.message);
        }

        res.status(201).json(nuevoPrestamo);
    } catch (error) {
        console.error("Error al crear prestamo:", error);
        res.status(500).json({ error: error.message });
    }
});

// PUT: Editar metadatos
router.put("/:id", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const { id } = req.params;
        const prestamo = await Prestamos.findOne({ where: { id, user_id: userId } });
        if (!prestamo) return res.status(404).json({ error: "Préstamo no encontrado" });

        const editable = [
            "nombre_persona", "monto_original", "divisa", "fecha_prestamo",
            "fecha_vencimiento", "descripcion", "estado"
        ];
        const updates = {};
        for (const k of editable) if (k in req.body) updates[k] = req.body[k];

        if (updates.monto_original !== undefined) {
            const nuevoOriginal = parseFloat(updates.monto_original);
            if (parseFloat(prestamo.saldo_restante) > nuevoOriginal) {
                updates.saldo_restante = nuevoOriginal;
            }
        }

        await prestamo.update(updates);
        res.json(prestamo);
    } catch (error) {
        console.error("Error al actualizar prestamo:", error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /:id/abonar — registrar un cobro
router.put("/:id/abonar", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const { id } = req.params;
        const { monto, fecha, marcar_pagado } = req.body;

        const prestamo = await Prestamos.findOne({ where: { id, user_id: userId } });
        if (!prestamo) return res.status(404).json({ error: "Préstamo no encontrado" });

        const result = await registrarCobroPrestamo({
            prestamo,
            monto,
            fecha,
            numero_cel: res.locals.user.telefono,
            marcar_pagado: !!marcar_pagado
        });

        res.json({ prestamo: result.prestamo, movimiento: result.movimiento });
    } catch (error) {
        console.error("Error al registrar cobro:", error);
        res.status(400).json({ error: error.message });
    }
});

// GET /:id/movimientos
router.get("/:id/movimientos", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const { id } = req.params;
        const prestamo = await Prestamos.findOne({ where: { id, user_id: userId } });
        if (!prestamo) return res.status(404).json({ error: "Préstamo no encontrado" });

        const movimientos = await Movimientos.findAll({
            where: { user_id: userId, entidad_tipo: "prestamo", entidad_id: id },
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
        const prestamo = await Prestamos.findOne({ where: { id, user_id: userId } });
        if (!prestamo) return res.status(404).json({ error: "No encontrado" });
        await prestamo.destroy();
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
