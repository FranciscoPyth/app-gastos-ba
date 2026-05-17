const express = require("express");
const router = express.Router();
const { Deudas, Movimientos } = require("../models");
const { authenticateJWT } = require("../security/auth");
const { registrarAbonoDeuda, registrarCreacionDeuda } = require("../utils/movimientos");

// GET: Listar todas las deudas del usuario
router.get("/", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const deudas = await Deudas.findAll({
            where: { user_id: userId },
            order: [["created_at", "DESC"]]
        });
        res.json(deudas);
    } catch (error) {
        console.error("Error al obtener deudas:", error);
        res.status(500).json({ error: error.message });
    }
});

// POST: Crear nueva deuda
router.post("/", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const {
            nombre_acreedor,
            monto_original,
            monto_prestamo,     // alias legacy
            divisa,
            tasa_interes,
            pago_mensual,
            cantidad_cuotas,
            fecha_inicio,
            fecha_fin,
            descripcion,
            origen,
            estado
        } = req.body;

        const original = parseFloat(monto_original || monto_prestamo);
        if (!nombre_acreedor || isNaN(original) || original <= 0) {
            return res.status(400).json({ error: "nombre_acreedor y monto_original son requeridos" });
        }

        const nuevaDeuda = await Deudas.create({
            user_id: userId,
            nombre_acreedor,
            monto_original: original,
            saldo_restante: original,
            divisa: divisa || "ARS",
            tasa_interes: tasa_interes || 0,
            pago_mensual: pago_mensual || 0,
            cantidad_cuotas: cantidad_cuotas || 1,
            fecha_inicio: fecha_inicio || null,
            fecha_fin: fecha_fin || null,
            descripcion: descripcion || "",
            origen: origen || "Otro",
            estado: estado || "activa"
        });

        // Registrar movimiento de toma de deuda (ingreso de plata)
        try {
            await registrarCreacionDeuda(nuevaDeuda, { numero_cel: res.locals.user.telefono });
        } catch (e) {
            console.error("[deudas] no se pudo registrar movimiento de toma:", e.message);
        }

        res.status(201).json(nuevaDeuda);
    } catch (error) {
        console.error("Error al crear deuda:", error);
        res.status(500).json({ error: error.message });
    }
});

// PUT: Editar metadatos (no toca saldo_restante; usar /abonar para pagos)
router.put("/:id", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const { id } = req.params;
        const deuda = await Deudas.findOne({ where: { id, user_id: userId } });
        if (!deuda) return res.status(404).json({ error: "Deuda no encontrada" });

        // Campos editables (saldo_restante NO se toca por aquí — sólo vía /abonar)
        const editable = [
            "nombre_acreedor", "monto_original", "divisa", "tasa_interes",
            "pago_mensual", "cantidad_cuotas", "fecha_inicio", "fecha_fin",
            "descripcion", "origen", "estado"
        ];
        const updates = {};
        for (const k of editable) if (k in req.body) updates[k] = req.body[k];

        // Si cambia monto_original y el saldo_restante actual lo excede, ajustamos
        if (updates.monto_original !== undefined) {
            const nuevoOriginal = parseFloat(updates.monto_original);
            if (parseFloat(deuda.saldo_restante) > nuevoOriginal) {
                updates.saldo_restante = nuevoOriginal;
            }
        }

        await deuda.update(updates);
        res.json(deuda);
    } catch (error) {
        console.error("Error al actualizar deuda:", error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /:id/abonar — registra un pago hacia la deuda
router.put("/:id/abonar", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const { id } = req.params;
        const { monto, fecha, marcar_cerrada } = req.body;

        const deuda = await Deudas.findOne({ where: { id, user_id: userId } });
        if (!deuda) return res.status(404).json({ error: "Deuda no encontrada" });

        const result = await registrarAbonoDeuda({
            deuda,
            monto,
            fecha,
            numero_cel: res.locals.user.telefono,
            marcar_cerrada: !!marcar_cerrada
        });

        res.json({ deuda: result.deuda, movimiento: result.movimiento });
    } catch (error) {
        console.error("Error al registrar abono:", error);
        res.status(400).json({ error: error.message });
    }
});

// GET /:id/movimientos — historial de la deuda
router.get("/:id/movimientos", authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const { id } = req.params;
        const deuda = await Deudas.findOne({ where: { id, user_id: userId } });
        if (!deuda) return res.status(404).json({ error: "Deuda no encontrada" });

        const movimientos = await Movimientos.findAll({
            where: { user_id: userId, entidad_tipo: "deuda", entidad_id: id },
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
        const deuda = await Deudas.findOne({ where: { id, user_id: userId } });
        if (!deuda) return res.status(404).json({ error: "No encontrada" });
        await deuda.destroy();
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
