const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const { Gastos, MetodosPagos, Divisas, TiposTransacciones, Categorias, Usuarios, GastosPruebaN8N } = require("../models");
const { ValidationError } = require("sequelize"); // Asegúrate de importar ValidationError
const { normalizarTelefono } = require('../utils/phoneUtils');

// GET: Obtener todos los gastos con filtros opcionales

router.get("/", async (req, res) => {
  try {
    let where = {};

    // Filtro por descripción
    if (req.query.descripcion != undefined && req.query.descripcion !== "") {
      where.descripcion = {
        [Op.like]: "%" + req.query.descripcion + "%",
      };
    }

    // Filtro por usuario_id
    if (req.query.usuario_id != undefined && req.query.usuario_id !== "") {
      where.usuario_id = req.query.usuario_id; // Asegúrate de que el campo en la base de datos sea 'usuario_id'
    } else {
      console.error("No se ha proporcionado el ID del usuario.");
      return res.status(400).json({ error: "Falta el ID del usuario." });
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
router.post("/", async (req, res) => {
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
router.post("/registrar-gasto-telefono", async (req, res) => {
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
router.put("/:id", async (req, res) => {
  try {
    let id = req.params.id;
    let gasto = await Gastos.findByPk(id);
    if (!gasto) {
      return res.status(404).json({ error: "Gasto no encontrado" });
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
router.delete("/:id", async (req, res) => {
  try {
    let id = req.params.id;
    let gasto = await Gastos.findByPk(id);
    if (!gasto) {
      return res.status(404).json({ error: "Gasto no encontrado" });
    }

    await gasto.destroy();
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Consultar gastos por número de teléfono
router.get("/consulta-telefono", async (req, res) => {
  try {
    const telefono = req.query.telefono;

    if (!telefono) {
      return res.status(400).json({ error: "El parámetro 'telefono' es requerido." });
    }

    const telefonoNormalizado = normalizarTelefono(telefono);
    // Para esta búsqueda legacy, asumimos que se busca en la tabla Gastos que tiene BIGINT
    const telefonoInt = parseInt(telefonoNormalizado, 10);

    // Crear las variantes del número para buscar
    const variantes = [
      telefonoInt,                    // Número base: 549351...
      parseInt(telefonoNormalizado.replace(/^549/, ''), 10), // Sin 549
      parseInt(`54${telefonoNormalizado.replace(/^549/, '')}`, 10)   // Con 54
    ].filter(num => !isNaN(num) && num !== 0); // Filtrar valores NaN

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
router.get("/consulta-telefono-pruebas", async (req, res) => {
  try {
    const telefono = req.query.telefono;

    if (!telefono) {
      return res.status(400).json({ error: "El parámetro 'telefono' es requerido." });
    }

    const telefonoNormalizado = normalizarTelefono(telefono);

    // Buscar gastos en la tabla de pruebas
    let gastos = await GastosPruebaN8N.findAll({
      where: {
        numero_cel: telefonoNormalizado
      },
      order: [["created_at", "DESC"]]
    });

    res.json({
      tabla: "GastosPruebaN8N",
      telefono_consultado: telefono,
      telefono_normalizado: telefonoNormalizado,
      total_gastos: gastos.length,
      gastos: gastos
    });

  } catch (error) {
    console.error("Error al consultar gastos en tabla de pruebas:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET: Obtener todos los gastos de la tabla de pruebas
router.get("/pruebas", async (req, res) => {
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
