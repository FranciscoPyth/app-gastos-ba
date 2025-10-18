const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const { Gastos, MetodosPagos, Divisas, TiposTransacciones, Categorias, Usuarios } = require("../models");
const { ValidationError } = require("sequelize"); // Asegúrate de importar ValidationError

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

// POST: Crear un nuevo gasto con número de teléfono
router.post("/registrar-gasto-telefono", async (req, res) => {
  try {
    console.log("Datos recibidos para gasto con teléfono:", req.body);
    
    // Validar que el número de teléfono esté presente
    if (!req.body.numero_cel) {
      return res.status(400).json({ error: "El número de teléfono es requerido para este endpoint." });
    }

    // Función para normalizar el número de teléfono
    const normalizarTelefono = (numero) => {
      // Convertir a string y remover cualquier carácter que no sea dígito
      let numeroLimpio = numero.toString().replace(/\D/g, '');
      
      // Si el número empieza con 549, remover el prefijo
      if (numeroLimpio.startsWith('549')) {
        numeroLimpio = numeroLimpio.substring(3);
      }
      // Si el número empieza con 54, remover el prefijo
      else if (numeroLimpio.startsWith('54')) {
        numeroLimpio = numeroLimpio.substring(2);
      }
      
      // Convertir a entero
      return parseInt(numeroLimpio, 10);
    };

    // Crear una copia de los datos del request
    const datosGasto = { ...req.body };
    
    // Normalizar el número de teléfono antes de guardarlo
    datosGasto.numero_cel = normalizarTelefono(req.body.numero_cel);

    // Validar que la normalización fue exitosa
    if (isNaN(datosGasto.numero_cel)) {
      return res.status(400).json({ error: "El número de teléfono proporcionado no es válido." });
    }

    console.log("Número de teléfono normalizado:", datosGasto.numero_cel);

    // Crear el nuevo gasto con el número normalizado
    let nuevoGasto = await Gastos.create(datosGasto);
    
    // Buscar el gasto creado con todas las relaciones para la respuesta
    let gastoCompleto = await Gastos.findByPk(nuevoGasto.id, {
      include: [
        { model: MetodosPagos },
        { model: Divisas },
        { model: TiposTransacciones },
        { model: Categorias },
        { model: Usuarios }
      ]
    });

    res.status(201).json({
      mensaje: "Gasto registrado exitosamente con número de teléfono",
      numero_original: req.body.numero_cel,
      numero_normalizado: datosGasto.numero_cel,
      gasto: gastoCompleto
    });

  } catch (error) {
    console.error("Error al crear el gasto con teléfono:", error);
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

    // Función para normalizar el número de teléfono a entero
    const normalizarTelefono = (numero) => {
      // Convertir a string y remover cualquier carácter que no sea dígito
      let numeroLimpio = numero.toString().replace(/\D/g, '');
      
      // Si el número empieza con 549, remover el prefijo
      if (numeroLimpio.startsWith('549')) {
        numeroLimpio = numeroLimpio.substring(3);
      }
      // Si el número empieza con 54, remover el prefijo
      else if (numeroLimpio.startsWith('54')) {
        numeroLimpio = numeroLimpio.substring(2);
      }
      
      // Convertir a entero
      return parseInt(numeroLimpio, 10);
    };

    const telefonoNormalizado = normalizarTelefono(telefono);

    // Crear las variantes del número para buscar
    const variantes = [
      telefonoNormalizado,                    // Número base: 3513244486
      parseInt(`54${telefonoNormalizado}`),   // Con prefijo 54: 543513244486
      parseInt(`549${telefonoNormalizado}`)   // Con prefijo 549: 5493513244486
    ].filter(num => !isNaN(num)); // Filtrar valores NaN

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

module.exports = router;
