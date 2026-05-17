const express = require("express");
const router = express.Router();
const { Prestamos, Deudas, Objetivos, Usuarios, UsuarioTelefonos, Movimientos } = require("../models");
const combinedAuth = require("../security/combinedAuth");
const { normalizarTelefono } = require('../utils/phoneUtils');
const {
    registrarAbonoDeuda,
    registrarCobroPrestamo,
    registrarMovimientoObjetivo,
    registrarCreacionDeuda,
    registrarCreacionPrestamo
} = require('../utils/movimientos');
const { Op } = require("sequelize");

// --- UTILIDAD: Resolver User ID desde el número de teléfono (n8n WhatsApp) ---
async function getUserIdByPhone(numero_cel) {
    if (!numero_cel) return null;
    const telefonoNormalizado = normalizarTelefono(numero_cel);

    let usuario = await Usuarios.findOne({ where: { telefono: telefonoNormalizado } });
    if (usuario) return usuario.id;

    const numeroLocal = telefonoNormalizado.replace(/^549/, '');
    let usuarioVago = await Usuarios.findOne({
        where: { [Op.or]: [{ telefono: { [Op.like]: "%" + numeroLocal + "%" } }] }
    });
    if (usuarioVago) return usuarioVago.id;

    let telefonoAdicional = await UsuarioTelefonos.findOne({
        where: {
            [Op.or]: [
                { telefono: telefonoNormalizado },
                { telefono: { [Op.like]: "%" + numeroLocal + "%" } }
            ]
        }
    });
    if (telefonoAdicional) return telefonoAdicional.user_id;

    return null;
}

function checkOwnership(req, userId) {
    if (!req.isSystem && userId.toString() !== req.user.id.toString()) {
        return false;
    }
    return true;
}

// ============================================
// ======== ESTADO FINANCIERO MAESTRO =========
// ============================================
router.get("/estado-financiero", combinedAuth, async (req, res) => {
    try {
        const { numero_cel } = req.query;
        if (!numero_cel) return res.status(400).json({ error: "Falta numero_cel" });
        const userId = await getUserIdByPhone(numero_cel);
        if (!userId) return res.status(404).json({ error: "Usuario no encontrado" });
        if (!checkOwnership(req, userId)) return res.status(403).json({ error: "No autorizado" });

        const [prestamos, deudas, objetivos] = await Promise.all([
            Prestamos.findAll({ where: { user_id: userId, estado: { [Op.ne]: "pagado" } } }),
            Deudas.findAll({ where: { user_id: userId, estado: { [Op.ne]: "cerrada" } } }),
            Objetivos.findAll({ where: { user_id: userId } })
        ]);

        res.json({
            prestamos_activos: prestamos,
            deudas_activas: deudas,
            objetivos_ahorro: objetivos
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ================= PRÉSTAMOS ================
// ============================================
router.get("/prestamos", combinedAuth, async (req, res) => {
    try {
        const { numero_cel } = req.query;
        if (!numero_cel) return res.status(400).json({ error: "Falta numero_cel" });
        const userId = await getUserIdByPhone(numero_cel);
        if (!userId) return res.status(404).json({ error: "Usuario no encontrado" });
        if (!checkOwnership(req, userId)) return res.status(403).json({ error: "No autorizado" });

        const prestamos = await Prestamos.findAll({ where: { user_id: userId } });
        res.json(prestamos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post("/prestamos", combinedAuth, async (req, res) => {
    try {
        const { numero_cel, personName, amount, currency, dueDate, description } = req.body;
        if (!numero_cel || !personName || !amount) {
            return res.status(400).json({ error: "numero_cel, personName y amount son requeridos" });
        }
        const userId = await getUserIdByPhone(numero_cel);
        if (!userId) return res.status(404).json({ error: "Usuario no encontrado" });
        if (!checkOwnership(req, userId)) return res.status(403).json({ error: "No autorizado" });

        const original = parseFloat(amount);
        const prestamo = await Prestamos.create({
            user_id: userId,
            nombre_persona: personName,
            monto_original: original,
            saldo_restante: original,
            divisa: currency || "ARS",
            fecha_prestamo: new Date(),
            fecha_vencimiento: dueDate || null,
            descripcion: description || "",
            estado: "pendiente"
        });

        try { await registrarCreacionPrestamo(prestamo, { numero_cel }); }
        catch (e) { console.error("[ia/prestamos] no se pudo registrar otorgamiento:", e.message); }

        res.status(201).json(prestamo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put("/prestamos/:id/abonar", combinedAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { numero_cel, monto_abono, marcar_pagado } = req.body;

        let userId = req.user ? req.user.id : null;
        if (!userId && numero_cel) userId = await getUserIdByPhone(numero_cel);
        if (!userId) return res.status(404).json({ error: "Usuario no encontrado" });
        if (!checkOwnership(req, userId)) return res.status(403).json({ error: "No autorizado" });

        const prestamo = await Prestamos.findOne({ where: { id, user_id: userId } });
        if (!prestamo) return res.status(404).json({ error: "Préstamo no encontrado" });

        const result = await registrarCobroPrestamo({
            prestamo,
            monto: monto_abono,
            numero_cel,
            marcar_pagado: !!marcar_pagado
        });

        res.json({ prestamo: result.prestamo, movimiento: result.movimiento, abono_registrado: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============================================
// ================= DEUDAS ===================
// ============================================
router.get("/deudas", combinedAuth, async (req, res) => {
    try {
        const { numero_cel } = req.query;
        if (!numero_cel) return res.status(400).json({ error: "Falta numero_cel" });
        const userId = await getUserIdByPhone(numero_cel);
        if (!userId) return res.status(404).json({ error: "Usuario no encontrado" });
        if (!checkOwnership(req, userId)) return res.status(403).json({ error: "No autorizado" });

        const deudas = await Deudas.findAll({ where: { user_id: userId } });
        res.json(deudas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post("/deudas", combinedAuth, async (req, res) => {
    try {
        const { numero_cel, creditorName, loanAmount, monthlyPayment, dueDate, currency, description } = req.body;
        if (!numero_cel || !creditorName || !loanAmount) {
            return res.status(400).json({ error: "numero_cel, creditorName y loanAmount son requeridos" });
        }
        const userId = await getUserIdByPhone(numero_cel);
        if (!userId) return res.status(404).json({ error: "Usuario no encontrado" });
        if (!checkOwnership(req, userId)) return res.status(403).json({ error: "No autorizado" });

        const original = parseFloat(loanAmount);
        const deuda = await Deudas.create({
            user_id: userId,
            nombre_acreedor: creditorName,
            monto_original: original,
            saldo_restante: original,
            pago_mensual: parseFloat(monthlyPayment || 0),
            divisa: currency || "ARS",
            tasa_interes: req.body.interestRate || 0,
            cantidad_cuotas: req.body.installments || 1,
            fecha_inicio: new Date(),
            fecha_fin: dueDate || null,
            descripcion: description || "",
            origen: req.body.source || "Otro",
            estado: "activa"
        });

        try { await registrarCreacionDeuda(deuda, { numero_cel }); }
        catch (e) { console.error("[ia/deudas] no se pudo registrar toma:", e.message); }

        res.status(201).json(deuda);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put("/deudas/:id/abonar", combinedAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { numero_cel, monto_abono, marcar_cerrada } = req.body;

        let userId = req.user ? req.user.id : null;
        if (!userId && numero_cel) userId = await getUserIdByPhone(numero_cel);
        if (!userId) return res.status(404).json({ error: "Usuario no encontrado" });
        if (!checkOwnership(req, userId)) return res.status(403).json({ error: "No autorizado" });

        const deuda = await Deudas.findOne({ where: { id, user_id: userId } });
        if (!deuda) return res.status(404).json({ error: "Deuda no encontrada" });

        const result = await registrarAbonoDeuda({
            deuda,
            monto: monto_abono,
            numero_cel,
            marcar_cerrada: !!marcar_cerrada
        });

        res.json({ deuda: result.deuda, movimiento: result.movimiento, abono_registrado: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============================================
// ================ OBJETIVOS =================
// ============================================
router.get("/objetivos", combinedAuth, async (req, res) => {
    try {
        const { numero_cel } = req.query;
        if (!numero_cel) return res.status(400).json({ error: "Falta numero_cel" });
        const userId = await getUserIdByPhone(numero_cel);
        if (!userId) return res.status(404).json({ error: "Usuario no encontrado" });
        if (!checkOwnership(req, userId)) return res.status(403).json({ error: "No autorizado" });

        const objetivos = await Objetivos.findAll({ where: { user_id: userId } });
        res.json(objetivos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post("/objetivos", combinedAuth, async (req, res) => {
    try {
        const { numero_cel, nombre, monto_objetivo, fecha_limite, descripcion, divisa } = req.body;
        if (!nombre || !monto_objetivo) return res.status(400).json({ error: "nombre y monto_objetivo requeridos" });

        let userId = req.user ? req.user.id : null;
        if (!userId && numero_cel) userId = await getUserIdByPhone(numero_cel);
        if (!userId) return res.status(404).json({ error: "Usuario no encontrado" });
        if (!checkOwnership(req, userId)) return res.status(403).json({ error: "No autorizado" });

        const objetivo = await Objetivos.create({
            user_id: userId,
            nombre,
            monto_objetivo: parseFloat(monto_objetivo),
            monto_actual: req.body.monto_actual || 0,
            divisa: divisa || "ARS",
            fecha_limite: fecha_limite || null,
            descripcion: descripcion || "",
            estado: "activa"
        });

        res.status(201).json(objetivo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put("/objetivos/:id/abonar", combinedAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { numero_cel, monto_abono, tipo } = req.body;

        let userId = req.user ? req.user.id : null;
        if (!userId && numero_cel) userId = await getUserIdByPhone(numero_cel);
        if (!userId) return res.status(404).json({ error: "Usuario no encontrado" });
        if (!checkOwnership(req, userId)) return res.status(403).json({ error: "No autorizado" });

        const objetivo = await Objetivos.findOne({ where: { id, user_id: userId } });
        if (!objetivo) return res.status(404).json({ error: "Objetivo no encontrado" });

        const result = await registrarMovimientoObjetivo({
            objetivo,
            monto: monto_abono,
            numero_cel,
            tipo: tipo === "retiro" ? "retiro" : "aporte"
        });

        res.json({ objetivo: result.objetivo, movimiento: result.movimiento, abono_registrado: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============================================
// ========= UPDATES (PUT /:id) ===============
// ============================================
// Endpoints de actualización para que el agente IA pueda editar entidades existentes.

function pickFields(body, allowed) {
    const out = {};
    for (const k of allowed) if (k in body) out[k] = body[k];
    return out;
}

router.put("/deudas/:id", combinedAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { numero_cel } = req.body;
        let userId = req.user ? req.user.id : null;
        if (!userId && numero_cel) userId = await getUserIdByPhone(numero_cel);
        if (!userId) return res.status(404).json({ error: "Usuario no encontrado" });
        if (!checkOwnership(req, userId)) return res.status(403).json({ error: "No autorizado" });

        const deuda = await Deudas.findOne({ where: { id, user_id: userId } });
        if (!deuda) return res.status(404).json({ error: "Deuda no encontrada" });

        const updates = pickFields(req.body, [
            "nombre_acreedor", "monto_original", "divisa", "tasa_interes",
            "pago_mensual", "cantidad_cuotas", "fecha_inicio", "fecha_fin",
            "descripcion", "origen", "estado"
        ]);
        if (updates.monto_original !== undefined) {
            const nuevoOriginal = parseFloat(updates.monto_original);
            if (parseFloat(deuda.saldo_restante) > nuevoOriginal) updates.saldo_restante = nuevoOriginal;
        }
        await deuda.update(updates);
        res.json(deuda);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put("/prestamos/:id", combinedAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { numero_cel } = req.body;
        let userId = req.user ? req.user.id : null;
        if (!userId && numero_cel) userId = await getUserIdByPhone(numero_cel);
        if (!userId) return res.status(404).json({ error: "Usuario no encontrado" });
        if (!checkOwnership(req, userId)) return res.status(403).json({ error: "No autorizado" });

        const prestamo = await Prestamos.findOne({ where: { id, user_id: userId } });
        if (!prestamo) return res.status(404).json({ error: "Préstamo no encontrado" });

        const updates = pickFields(req.body, [
            "nombre_persona", "monto_original", "divisa",
            "fecha_prestamo", "fecha_vencimiento", "descripcion", "estado"
        ]);
        if (updates.monto_original !== undefined) {
            const nuevoOriginal = parseFloat(updates.monto_original);
            if (parseFloat(prestamo.saldo_restante) > nuevoOriginal) updates.saldo_restante = nuevoOriginal;
        }
        await prestamo.update(updates);
        res.json(prestamo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put("/objetivos/:id", combinedAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { numero_cel } = req.body;
        let userId = req.user ? req.user.id : null;
        if (!userId && numero_cel) userId = await getUserIdByPhone(numero_cel);
        if (!userId) return res.status(404).json({ error: "Usuario no encontrado" });
        if (!checkOwnership(req, userId)) return res.status(403).json({ error: "No autorizado" });

        const objetivo = await Objetivos.findOne({ where: { id, user_id: userId } });
        if (!objetivo) return res.status(404).json({ error: "Objetivo no encontrado" });

        const updates = pickFields(req.body, [
            "nombre", "monto_objetivo", "divisa", "fecha_limite", "descripcion", "estado"
        ]);
        await objetivo.update(updates);
        res.json(objetivo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
