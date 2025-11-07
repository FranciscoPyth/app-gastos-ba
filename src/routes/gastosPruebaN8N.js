const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const { GastosPruebaN8N } = require("../models");
const { ValidationError } = require("sequelize");

// GET: Obtener todos los gastos de prueba con filtros opcionales
router.get("/", async (req, res) => {
  try {
    let where = {};

    // Filtro por descripción (búsqueda parcial)
    if (req.query.descripcion != undefined && req.query.descripcion !== "") {
      where.descripcion = {
        [Op.like]: "%" + req.query.descripcion + "%",
      };
    }

    // Filtro por monto exacto
    if (req.query.monto != undefined && req.query.monto !== "") {
      where.monto = parseFloat(req.query.monto);
    }

    // Filtro por rango de montos
    if (req.query.monto_min != undefined && req.query.monto_min !== "") {
      if (!where.monto) where.monto = {};
      where.monto[Op.gte] = parseFloat(req.query.monto_min);
    }
    if (req.query.monto_max != undefined && req.query.monto_max !== "") {
      if (!where.monto) where.monto = {};
      where.monto[Op.lte] = parseFloat(req.query.monto_max);
    }

    // Filtro por fecha exacta
    if (req.query.fecha != undefined && req.query.fecha !== "") {
      where.fecha = req.query.fecha;
    }

    // Filtro por rango de fechas
    if (req.query.fecha_desde != undefined && req.query.fecha_desde !== "") {
      if (!where.fecha) where.fecha = {};
      where.fecha[Op.gte] = req.query.fecha_desde;
    }
    if (req.query.fecha_hasta != undefined && req.query.fecha_hasta !== "") {
      if (!where.fecha) where.fecha = {};
      where.fecha[Op.lte] = req.query.fecha_hasta;
    }

    // Filtro por divisa (búsqueda parcial)
    if (req.query.divisa != undefined && req.query.divisa !== "") {
      where.divisa = {
        [Op.like]: "%" + req.query.divisa + "%",
      };
    }

    // Filtro por tipos_transaccion (búsqueda parcial)
    if (req.query.tipos_transaccion != undefined && req.query.tipos_transaccion !== "") {
      where.tipos_transaccion = {
        [Op.like]: "%" + req.query.tipos_transaccion + "%",
      };
    }

    // Filtro por metodo_pago (búsqueda parcial)
    if (req.query.metodo_pago != undefined && req.query.metodo_pago !== "") {
      where.metodo_pago = {
        [Op.like]: "%" + req.query.metodo_pago + "%",
      };
    }

    // Filtro por categoria (búsqueda parcial)
    if (req.query.categoria != undefined && req.query.categoria !== "") {
      where.categoria = {
        [Op.like]: "%" + req.query.categoria + "%",
      };
    }

    // Filtro por numero_cel
    if (req.query.numero_cel != undefined && req.query.numero_cel !== "") {
      // Función para normalizar el número de teléfono
      const normalizarTelefono = (numero) => {
        let numeroLimpio = numero.toString().replace(/\D/g, '');
        
        if (numeroLimpio.startsWith('549')) {
          numeroLimpio = numeroLimpio.substring(3);
        } else if (numeroLimpio.startsWith('54')) {
          numeroLimpio = numeroLimpio.substring(2);
        }
        
        return numeroLimpio;
      };

      const telefonoNormalizado = normalizarTelefono(req.query.numero_cel);
      
      // Búsqueda exacta o parcial según se especifique
      if (req.query.numero_cel_exacto === 'true') {
        where.numero_cel = telefonoNormalizado;
      } else {
        where.numero_cel = {
          [Op.like]: "%" + telefonoNormalizado + "%",
        };
      }
    }

    // Parámetros de paginación
    let limit = undefined;
    let offset = undefined;
    
    if (req.query.limit != undefined && req.query.limit !== "") {
      limit = parseInt(req.query.limit);
    }
    
    if (req.query.offset != undefined && req.query.offset !== "") {
      offset = parseInt(req.query.offset);
    }

    // Parámetros de ordenamiento
    let order = [["created_at", "DESC"]]; // Por defecto ordenar por fecha de creación descendente
    
    if (req.query.order_by != undefined && req.query.order_by !== "") {
      const orderDirection = req.query.order_direction || "ASC";
      const validColumns = ['descripcion', 'monto', 'fecha', 'divisa', 'tipos_transaccion', 'metodo_pago', 'categoria', 'numero_cel', 'created_at'];
      
      if (validColumns.includes(req.query.order_by)) {
        order = [[req.query.order_by, orderDirection.toUpperCase()]];
      }
    }

    // Ejecutar consulta
    let result = await GastosPruebaN8N.findAndCountAll({
      where,
      order,
      limit,
      offset
    });

    // Preparar respuesta con metadatos
    const response = {
      total: result.count,
      filtros_aplicados: Object.keys(where).length > 0 ? where : "ninguno",
      paginacion: {
        limit: limit || "sin límite",
        offset: offset || 0,
        total_paginas: limit ? Math.ceil(result.count / limit) : 1
      },
      ordenamiento: {
        campo: order[0][0],
        direccion: order[0][1]
      },
      gastos: result.rows
    };

    res.json(response);

  } catch (error) {
    console.error("Error al obtener los gastos de prueba:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET: Obtener un gasto específico por ID
router.get("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const gasto = await GastosPruebaN8N.findByPk(id);
    
    if (!gasto) {
      return res.status(404).json({ error: "Gasto no encontrado" });
    }

    res.json(gasto);
  } catch (error) {
    console.error("Error al obtener el gasto:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST: Crear un nuevo gasto
router.post("/", async (req, res) => {
  try {
    console.log("Datos recibidos para nuevo gasto de prueba:", req.body);

    // Validar campos requeridos
    const camposRequeridos = ['descripcion', 'monto', 'fecha'];
    const camposFaltantes = camposRequeridos.filter(campo => !req.body[campo]);
    
    if (camposFaltantes.length > 0) {
      return res.status(400).json({ 
        error: `Campos requeridos faltantes: ${camposFaltantes.join(', ')}` 
      });
    }

    // Función para normalizar el número de teléfono si se proporciona
    const normalizarTelefono = (numero) => {
      if (!numero) return null;
      
      let numeroLimpio = numero.toString().replace(/\D/g, '');
      
      if (numeroLimpio.startsWith('549')) {
        numeroLimpio = numeroLimpio.substring(3);
      } else if (numeroLimpio.startsWith('54')) {
        numeroLimpio = numeroLimpio.substring(2);
      }
      
      return numeroLimpio;
    };

    // Preparar datos
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

    // Crear el nuevo gasto
    let nuevoGasto = await GastosPruebaN8N.create(datosGasto);

    res.status(201).json({
      mensaje: "Gasto creado exitosamente",
      numero_original: req.body.numero_cel,
      numero_normalizado: datosGasto.numero_cel,
      gasto: nuevoGasto
    });

  } catch (error) {
    console.error("Error al crear el gasto:", error);
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.errors.map(e => e.message) });
    }
    res.status(500).json({ error: error.message });
  }
});

// PUT: Actualizar un gasto existente por ID
router.put("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    let gasto = await GastosPruebaN8N.findByPk(id);
    
    if (!gasto) {
      return res.status(404).json({ error: "Gasto no encontrado" });
    }

    // Normalizar número de teléfono si se está actualizando
    if (req.body.numero_cel) {
      const normalizarTelefono = (numero) => {
        let numeroLimpio = numero.toString().replace(/\D/g, '');
        
        if (numeroLimpio.startsWith('549')) {
          numeroLimpio = numeroLimpio.substring(3);
        } else if (numeroLimpio.startsWith('54')) {
          numeroLimpio = numeroLimpio.substring(2);
        }
        
        return numeroLimpio;
      };

      req.body.numero_cel = normalizarTelefono(req.body.numero_cel);
    }

    let updatedGasto = await gasto.update(req.body);
    res.json(updatedGasto);
  } catch (error) {
    console.error("Error al actualizar el gasto:", error);
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.errors.map(e => e.message) });
    }
    res.status(500).json({ error: error.message });
  }
});

// DELETE: Eliminar un gasto existente por ID
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    let gasto = await GastosPruebaN8N.findByPk(id);
    
    if (!gasto) {
      return res.status(404).json({ error: "Gasto no encontrado" });
    }

    await gasto.destroy();
    res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar el gasto:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;