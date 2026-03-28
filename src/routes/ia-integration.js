const express = require("express");
const router = express.Router();
const { Prestamos, Deudas, Objetivos, Usuarios, UsuarioTelefonos, GastosPruebaN8N } = require("../models");
const combinedAuth = require("../security/combinedAuth");
const { normalizarTelefono } = require('../utils/phoneUtils');
const { Op } = require("sequelize");

// --- UTILIDAD: Resolver User ID desde el número de teléfono (n8n WhatsApp) ---
async function getUserIdByPhone(numero_cel) {
    if (!numero_cel) return null;
    const telefonoNormalizado = normalizarTelefono(numero_cel);
    
    // Buscar en Usuarios (teléfono principal)
    let usuario = await Usuarios.findOne({
        where: { telefono: telefonoNormalizado }
    });

    if (usuario) return usuario.id;

    // Buscar en teléfonos adicionales o formato viejo
    const numeroLocal = telefonoNormalizado.replace(/^549/, '');
    
    let usuarioVago = await Usuarios.findOne({
        where: {
            [Op.or]: [
                { telefono: { [Op.like]: "%" + numeroLocal + "%" } }
            ]
        }
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

    return null; // No encontrado
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

        const prestamos = await Prestamos.findAll({ where: { user_id: userId, status: { [Op.ne]: "paid" } } });
        const deudas = await Deudas.findAll({ where: { user_id: userId, status: { [Op.ne]: "closed" } } });
        const objetivos = await Objetivos.findAll({ where: { user_id: userId } });

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

        const prestamo = await Prestamos.create({
            user_id: userId,
            personName: personName,
            amount: parseFloat(amount),
            currency: currency || "ARS",
            loanDate: new Date(),
            dueDate: dueDate || new Date(),
            description: description || "",
            status: "pending"
        });

        res.status(201).json(prestamo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put("/prestamos/:id/abonar", combinedAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { numero_cel, monto_abono, marcar_pagado } = req.body;
        
        let userId = null;
        if (res.locals.user && res.locals.user.id) {
            userId = res.locals.user.id;
        } else if (numero_cel) {
            userId = await getUserIdByPhone(numero_cel);
        }

        if (!userId) return res.status(404).json({ error: "Usuario no encontrado" });

        let celParaGasto = numero_cel;
        if (!celParaGasto) {
            const userObj = await Usuarios.findByPk(userId);
            celParaGasto = userObj ? userObj.telefono : "0000000000";
        }

        const prestamo = await Prestamos.findOne({ where: { id: id, user_id: userId } });
        if (!prestamo) return res.status(404).json({ error: "Préstamo no encontrado" });

        const nuevoMonto = Math.max(0, parseFloat(prestamo.monto) - parseFloat(monto_abono || 0));
        let statusToSet = marcar_pagado ? "paid" : prestamo.status;
        if (nuevoMonto <= 0) statusToSet = "paid";
        else statusToSet = "partial";

        await prestamo.update({ monto: nuevoMonto, status: statusToSet });

        // Si hay un abono explícito (dinero ingresando a mi bolsillo), lo registro en GastosPruebaN8N como Ingreso
        if (monto_abono > 0) {
            await GastosPruebaN8N.create({
                numero_cel: normalizarTelefono(celParaGasto),
                descripcion: `Devolución préstamo: ${prestamo.personName}`,
                monto: parseFloat(monto_abono),
                fecha: new Date(),
                divisa: prestamo.currency,
                tipos_transaccion: "Ingreso",
                categoria: "Préstamos"
            });
        }

        res.json({ prestamo, abono_registrado: monto_abono > 0 });
    } catch (error) {
        res.status(500).json({ error: error.message });
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

        const deuda = await Deudas.create({
            user_id: userId,
            creditorName: creditorName,
            loanAmount: parseFloat(loanAmount),
            monthlyPayment: parseFloat(monthlyPayment || 0),
            currency: currency || "ARS",
            interestRate: req.body.interestRate || 0,
            installments: req.body.installments || 1,
            startDate: new Date(),
            endDate: dueDate || new Date(),
            description: description || "",
            source: req.body.source || "Otro",
            status: "active"
        });

        res.status(201).json(deuda);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put("/deudas/:id/abonar", combinedAuth, async (req, res) => {
    // Al pagar una deuda, se registra un egreso en GastosPruebaN8N
    try {
        const { id } = req.params;
        const { numero_cel, monto_abono, marcar_cerrada } = req.body;
        
        const userId = req.user ? req.user.userId : await getUserIdByPhone(numero_cel);
        if (!userId) return res.status(404).json({ error: "Usuario no encontrado" });

        let celParaGasto = numero_cel;
        if (!celParaGasto) {
            const userObj = await Usuarios.findByPk(userId);
            celParaGasto = userObj ? userObj.telefono : "0000000000";
        }

        const deuda = await Deudas.findOne({ where: { id: id, user_id: userId } });
        if (!deuda) return res.status(404).json({ error: "Deuda no encontrada" });

        // Calculamos la nueva deuda si solo mandan el abono parcial
        const nuevoMonto = Math.max(0, deuda.loanAmount - (monto_abono || 0));
        let statusToSet = marcar_cerrada ? "closed" : deuda.status;
        if (nuevoMonto <= 0) statusToSet = "closed";

        // Actualizamos la deuda en DB con el nuevo monto
        await deuda.update({ loanAmount: nuevoMonto, status: statusToSet });

        if (monto_abono > 0) {
            await GastosPruebaN8N.create({
                numero_cel: normalizarTelefono(celParaGasto),
                descripcion: `Pago deuda: ${deuda.creditorName}`,
                monto: parseFloat(monto_abono),
                fecha: new Date(),
                divisa: deuda.currency,
                tipos_transaccion: "Gasto", // Sale dinero
                categoria: "Deudas"
            });
        }

        res.json({ deuda, abono_registrado: monto_abono > 0 });
    } catch (error) {
        res.status(500).json({ error: error.message });
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

        const objetivos = await Objetivos.findAll({ where: { user_id: userId } });
        res.json(objetivos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post("/objetivos", combinedAuth, async (req, res) => {
    try {
        const { numero_cel, nombre, monto_objetivo, fecha_limite, descripcion } = req.body;
        if (!nombre || !monto_objetivo) return res.status(400).json({ error: "nombre y monto_objetivo requeridos" });

        let userId = null;
        if (res.locals.user && res.locals.user.id) {
            userId = res.locals.user.id;
        } else if (numero_cel) {
            userId = await getUserIdByPhone(numero_cel);
        }

        if (!userId) return res.status(404).json({ error: "Usuario no encontrado" });

        const objetivo = await Objetivos.create({
            user_id: userId,
            nombre,
            monto_objetivo: parseFloat(monto_objetivo),
            monto_actual: req.body.monto_actual || 0,
            fecha_limite: fecha_limite || new Date(),
            descripcion: description || ""
        });

        res.status(201).json(objetivo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put("/objetivos/:id/abonar", combinedAuth, async (req, res) => {
    // Al ahorrar plata, se registra como Gasto (plata que ya no puedes gastar, va al objetivo) 
    // Opcional: Se puede tipificar como Inversión o Ahorro si la tabla GastosPruebaN8N lo soporta.
    try {
        const { id } = req.params;
        const { numero_cel, monto_abono } = req.body;
        
        let userId = null;
        if (res.locals.user && res.locals.user.id) {
            userId = res.locals.user.id;
        } else if (numero_cel) {
            userId = await getUserIdByPhone(numero_cel);
        }

        if (!userId) return res.status(404).json({ error: "Usuario no encontrado" });

        let celParaGasto = numero_cel;
        if (!celParaGasto) {
            const userObj = await Usuarios.findByPk(userId);
            celParaGasto = userObj ? userObj.telefono : "0000000000";
        }

        const objetivo = await Objetivos.findOne({ where: { id: id, user_id: userId } });
        if (!objetivo) return res.status(404).json({ error: "Objetivo no encontrado" });

        const nuevoActual = parseFloat(objetivo.monto_actual) + parseFloat(monto_abono);
        await objetivo.update({ monto_actual: nuevoActual });

        if (monto_abono > 0) {
            await GastosPruebaN8N.create({
                numero_cel: normalizarTelefono(celParaGasto),
                descripcion: `Ahorro objetivo: ${objetivo.nombre}`,
                monto: parseFloat(monto_abono),
                fecha: new Date(),
                divisa: req.body.currency || "ARS",
                tipos_transaccion: "Gasto", // Sale dinero de 'disponible' para ir a ahorro
                categoria: "Ahorro/Objetivo"
            });
        }

        res.json({ objetivo, abono_registrado: monto_abono > 0 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
