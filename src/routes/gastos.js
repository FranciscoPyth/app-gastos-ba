const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const { Gastos, MetodosPagos, Divisas, TiposTransacciones, Categorias, Usuarios, GastosPruebaN8N, Objetivos, Deudas, Prestamos, UsuarioTelefonos } = require("../models");
const { ValidationError } = require("sequelize"); // Asegúrate de importar ValidationError
const { normalizarTelefono, obtenerVariantesTelefono } = require('../utils/phoneUtils');
const apiKeyMiddleware = require('../security/apiKey');
const { authenticateJWT } = require("../security/auth");

// Middleware combinado: API Key o JWT
const combinedAuth = require("../security/combinedAuth");

// GET: Obtener todos los gastos con filtros opcionales

router.get("/", combinedAuth, async (req, res) => {
  try {
    let where = {};

    // Filtro por descripción
    if (req.query.descripcion != undefined && req.query.descripcion !== "") {
      where.descripcion = {
        [Op.like]: "%" + req.query.descripcion + "%",
      };
    }

    // Filtro por usuario_id y protección IDOR
    if (req.query.usuario_id != undefined && req.query.usuario_id !== "") {
      // Si no es sistema, DEBE coincidir con el usuario logueado
      if (!req.isSystem && req.query.usuario_id.toString() !== req.user.id.toString()) {
        return res.status(403).json({ error: "No tiene permiso para acceder a los gastos de este usuario." });
      }
      where.usuario_id = req.query.usuario_id;
    } else {
      // Si no es sistema y no envió ID, forzamos el suyo
      if (!req.isSystem) {
        where.usuario_id = req.user.id;
      } else {
        console.error("No se ha proporcionado el ID del usuario.");
        return res.status(400).json({ error: "Falta el ID del usuario." });
      }
    }

    let items = await Gastos.findAndCountAll({
      include: [
        { model: MetodosPagos },
        { model: Divisas },
        { model: TiposTransacciones },
        { model: Categorias },
        { model: Usuarios }
      ],
      order: [["fecha", "ASC"]],
      where,
    });

    res.json(items.rows);
  } catch (error) {
    console.error("Error al obtener los gastos:", error);
    res.status(500).json({ error: error.message });
  }
});


// POST: Crear un nuevo gasto
router.post("/", combinedAuth, async (req, res) => {
  try {
    console.log("Datos recibidos en el backend:", req.body); // Añade esta línea
    let nuevoGasto = await Gastos.create(req.body);
    res.status(201).json(nuevoGasto);
  } catch (error) {
    console.error("Error al crear el gasto:", error); // Añade esta línea
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.errors.map(e => e.message) });
    }
    res.status(500).json({ error: error.message });
  }
});

// POST: Crear un nuevo gasto con número de teléfono (tabla de pruebas)
router.post("/registrar-gasto-telefono", combinedAuth, async (req, res) => {
  try {
    console.log("Datos recibidos para gasto con teléfono (tabla pruebas):", req.body);

    // Validar que el número de teléfono esté presente
    if (!req.body.numero_cel) {
      return res.status(400).json({ error: "El número de teléfono es requerido para este endpoint." });
    }

    // Validar campos requeridos
    const camposRequeridos = ['descripcion', 'monto', 'fecha'];
    const camposFaltantes = camposRequeridos.filter(campo => !req.body[campo]);

    if (camposFaltantes.length > 0) {
      return res.status(400).json({
        error: `Campos requeridos faltantes: ${camposFaltantes.join(', ')}`
      });
    }

    // Crear los datos para la nueva tabla (sin relaciones)
    const datosGasto = {
      descripcion: req.body.descripcion,
      monto: parseFloat(req.body.monto),
      fecha: req.body.fecha,
      divisa: req.body.divisa || null,
      tipos_transaccion: req.body.tipos_transaccion || null,
      metodo_pago: req.body.metodo_pago || null,
      categoria: req.body.categoria || null,
      numero_cel: normalizarTelefono(req.body.numero_cel)
    };

    console.log("Datos procesados para guardar:", datosGasto);

    // Crear el nuevo gasto en la tabla de pruebas
    let nuevoGasto = await GastosPruebaN8N.create(datosGasto);

    // --- LÓGICA DE FORWARD SYNC PARA IA ---
    // Si la categoría indica un flujo secundario (Deudas, Préstamos, Objetivos), lo procesamos
    try {
        if (datosGasto.categoria === "Ahorro/Objetivo" || datosGasto.categoria === "Deudas" || datosGasto.categoria === "Préstamos") {
            const telefonoLimpio = normalizarTelefono(datosGasto.numero_cel);
            
            // 1. Obtener User ID
            let userId = null;
            let usuario = await Usuarios.findOne({ where: { telefono: telefonoLimpio } });
            if (usuario) userId = usuario.id;
            
            if (!userId) {
                const numeroLocal = telefonoLimpio.replace(/^549/, '');
                let usuarioVago = await Usuarios.findOne({ where: { [Op.or]: [{ telefono: { [Op.like]: "%" + numeroLocal + "%" } }] } });
                if (usuarioVago) userId = usuarioVago.id;
                
                if (!userId) {
                    let telAdicional = await UsuarioTelefonos.findOne({ where: { [Op.or]: [{ telefono: telefonoLimpio }, { telefono: { [Op.like]: "%" + numeroLocal + "%" } }] } });
                    if (telAdicional) userId = telAdicional.user_id;
                }
            }

            if (userId) {
                // Parseamos descripción para obtener el nombre de la Entidad
                // Ej "Ahorro objetivo: Viaje a Miami" -> "Viaje a Miami"
                let entityName = "";
                if (datosGasto.descripcion.includes(":")) {
                    entityName = datosGasto.descripcion.split(":")[1].trim();
                } else {
                    entityName = datosGasto.descripcion;
                }

                if (datosGasto.categoria === "Ahorro/Objetivo") {
                    let obj = await Objetivos.findOne({ where: { user_id: userId, nombre: entityName }});
                    if (obj) {
                        await obj.update({ monto_actual: parseFloat(obj.monto_actual) + parseFloat(datosGasto.monto) });
                    } else {
                        await Objetivos.create({
                            user_id: userId, nombre: entityName, monto_objetivo: parseFloat(datosGasto.monto), monto_actual: parseFloat(datosGasto.monto), fecha_limite: new Date(), descripcion: "Creado automáticamente vía WhatsApp"
                        });
                    }
                } else if (datosGasto.categoria === "Deudas") {
                    let deuda = await Deudas.findOne({ where: { user_id: userId, nombre_acreedor: entityName }});
                    if (datosGasto.tipos_transaccion === "Ingreso") {
                        // El usuario RECIBIÓ plata prestada. Sube su deuda.
                        if (deuda) {
                            await deuda.update({ monto_prestamo: parseFloat(deuda.monto_prestamo) + parseFloat(datosGasto.monto) });
                        } else {
                            await Deudas.create({ user_id: userId, nombre_acreedor: entityName, monto_prestamo: parseFloat(datosGasto.monto), divisa: datosGasto.divisa || "ARS", fecha_inicio: new Date(), estado: "activo" });
                        }
                    } else {
                        // El usuario PAGÓ deuda (Egreso). Baja su deuda.
                        if (deuda) {
                            let nuevoMonto = Math.max(0, deuda.monto_prestamo - parseFloat(datosGasto.monto));
                            await deuda.update({ monto_prestamo: nuevoMonto, estado: nuevoMonto <= 0 ? "cerrado" : deuda.estado });
                        } else {
                            // Si no existe pero el usuario la registra como egreso (ej "plata que debo"), la creamos con el monto inicial
                            await Deudas.create({ user_id: userId, nombre_acreedor: entityName, monto_prestamo: parseFloat(datosGasto.monto), divisa: datosGasto.divisa || "ARS", fecha_inicio: new Date(), estado: "activo" });
                        }
                    }
                } else if (datosGasto.categoria === "Préstamos") {
                    let prestamo = await Prestamos.findOne({ where: { user_id: userId, nombre_persona: entityName }});
                    if (datosGasto.tipos_transaccion === "Egreso") {
                        // El usuario PRESTÓ plata (salió plata). Sube lo que le deben.
                        if (prestamo) {
                            await prestamo.update({ monto: parseFloat(prestamo.monto) + parseFloat(datosGasto.monto) });
                        } else {
                            await Prestamos.create({ user_id: userId, nombre_persona: entityName, monto: parseFloat(datosGasto.monto), divisa: datosGasto.divisa || "ARS", fecha_prestamo: new Date(), estado: "pendiente" });
                        }
                    } else {
                        // El usuario RECIBIÓ pago (Ingreso). Baja lo que le deben.
                        if (prestamo) {
                            let nuevoMonto = Math.max(0, prestamo.monto - parseFloat(datosGasto.monto));
                            await prestamo.update({ monto: nuevoMonto, estado: nuevoMonto <= 0 ? "pagado" : prestamo.estado });
                        } else {
                            // Caso borde: recibe plata de un préstamo no registrado, lo creamos con balance 0 o negativo? 
                            // Por ahora, si no existe el origen, simplemente no creamos para evitar ruido,
                            // pero para deudas sí es importante porque el bot a veces categoriza mal.
                        }
                    }
                }
            }
        }
    } catch (syncError) {
        console.error("Error en Forward Sync de IA:", syncError);
        // No rompemos la request principal si falla la sincronización secundaria
    }

    res.status(201).json({
      mensaje: "Gasto registrado exitosamente en tabla de pruebas",
      numero_original: req.body.numero_cel,
      numero_normalizado: datosGasto.numero_cel,
      gasto: nuevoGasto
    });

  } catch (error) {
    console.error("Error al crear el gasto en tabla de pruebas:", error);
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.errors.map(e => e.message) });
    }
    res.status(500).json({ error: error.message });
  }
});

// PUT: Actualizar un gasto existente por ID
router.put("/:id", combinedAuth, async (req, res) => {
  try {
    let id = req.params.id;
    let gasto = await Gastos.findByPk(id);
    if (!gasto) {
      return res.status(404).json({ error: "Gasto no encontrado" });
    }

    // Protección IDOR: Verificar propiedad
    if (!req.isSystem && gasto.usuario_id.toString() !== req.user.id.toString()) {
      return res.status(403).json({ error: "No tiene permiso para modificar este gasto." });
    }

    let updatedGasto = await gasto.update(req.body);
    res.json(updatedGasto);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.errors.map(e => e.message) });
    }
    res.status(500).json({ error: error.message });
  }
});

// DELETE: Eliminar un gasto existente por ID
router.delete("/:id", combinedAuth, async (req, res) => {
  try {
    let id = req.params.id;
    let gasto = await Gastos.findByPk(id);
    if (!gasto) {
      return res.status(404).json({ error: "Gasto no encontrado" });
    }

    // Protección IDOR: Verificar propiedad
    if (!req.isSystem && gasto.usuario_id.toString() !== req.user.id.toString()) {
      return res.status(403).json({ error: "No tiene permiso para eliminar este gasto." });
    }

    await gasto.destroy();
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Consultar gastos por número de teléfono
router.get("/consulta-telefono", apiKeyMiddleware, async (req, res) => {
  try {
    const telefono = req.query.telefono;

    if (!telefono) {
      return res.status(400).json({ error: "El parámetro 'telefono' es requerido." });
    }

    const telefonoNormalizado = normalizarTelefono(telefono);
    const variantesRaw = obtenerVariantesTelefono(telefono);

    // Para esta búsqueda legacy, la columna numero_cel es BIGINT
    const variantes = variantesRaw.map(v => parseInt(v, 10)).filter(num => !isNaN(num) && num !== 0);

    // Buscar gastos que coincidan con cualquiera de las variantes
    let gastos = await Gastos.findAll({
      include: [
        { model: MetodosPagos },
        { model: Divisas },
        { model: TiposTransacciones },
        { model: Categorias },
        { model: Usuarios }
      ],
      where: {
        numero_cel: {
          [Op.in]: variantes
        }
      },
      order: [["fecha", "DESC"]]
    });

    res.json({
      telefono_consultado: telefono,
      telefono_normalizado: telefonoNormalizado,
      variantes_buscadas: variantes,
      total_gastos: gastos.length,
      gastos: gastos
    });

  } catch (error) {
    console.error("Error al consultar gastos por teléfono:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET: Consultar gastos desde tabla de pruebas por número de teléfono
router.get("/consulta-telefono-pruebas", combinedAuth, async (req, res) => {
  try {
    const telefono = req.query.telefono;

    if (!telefono) {
      return res.status(400).json({ error: "El parámetro 'telefono' es requerido." });
    }

    const telefonoNormalizado = normalizarTelefono(telefono);
    const variantes = obtenerVariantesTelefono(telefono);

    // Buscar gastos en la tabla de pruebas
    let gastos = await GastosPruebaN8N.findAll({
      where: {
        numero_cel: {
          [Op.in]: variantes
        }
      },
      order: [["created_at", "DESC"]]
    });

    res.json({
      tabla: "GastosPruebaN8N",
      telefono_consultado: telefono,
      telefono_normalizado: telefonoNormalizado,
      variantes_buscadas: variantes,
      total_gastos: gastos.length,
      gastos: gastos
    });

  } catch (error) {
    console.error("Error al consultar gastos en tabla de pruebas:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET: Obtener todos los gastos de la tabla de pruebas
router.get("/pruebas", combinedAuth, async (req, res) => {
  try {
    let gastos = await GastosPruebaN8N.findAll({
      order: [["created_at", "DESC"]]
    });

    res.json({
      tabla: "GastosPruebaN8N",
      total_gastos: gastos.length,
      gastos: gastos
    });

  } catch (error) {
    console.error("Error al obtener gastos de tabla de pruebas:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
