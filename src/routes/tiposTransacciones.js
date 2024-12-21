const express = require("express");
const router = express.Router();
const { Gastos, MediosDePago, Divisas, TiposTransacciones, Categorias } = require("../models");

// GET: Obtener todos los gastos con filtros opcionales
router.get("/", async (req, res) => {
  try {
    let where = {};

    // Obtener el usuario_id de los parámetros de consulta
    const usuario_id = req.query.usuario_id;

    if (!usuario_id) {
      return res.status(400).json({ error: 'Usuario no autenticado' });
    }

    // Agregar filtro para usuario_id
    where.usuario_id = usuario_id;

    // Agregar filtros según sea necesario, aquí hay un ejemplo para descripción
    if (req.query.descripcion != undefined && req.query.descripcion !== "") {
      where.descripcion = {
        [Op.like]: "%" + req.query.descripcion + "%",
      };
    }

    let items = await TiposTransacciones.findAndCountAll({
      order: [["descripcion", "ASC"]],
      where,
    });

    res.json(items.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



// GET: Obtener un gasto por ID
router.get('/:id', async (req, res) => {
  try {
    let id = req.params.id;
    let TiposTransacciones = await TiposTransacciones.findByPk(id);
    if (!TiposTransacciones) {
      return res.status(404).json({ error: 'Medio de pago no encontrada' });
    }
    res.json(TiposTransacciones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST: Crear un nuevo gasto
router.post("/", async (req, res) => {
  try {
    let nuevaTransaccion = await TiposTransacciones.create(req.body);
    res.status(201).json(nuevaTransaccion);
  } catch (error) {
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
    let transaccion = await TiposTransacciones.findByPk(id);
    if (!transaccion) {
      return res.status(404).json({ error: "Tipo transaccion no encontrado" });
    }

    let updateTransaccion = await transaccion.update(req.body);
    res.json(updateTransaccion);
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
    let transaccion = await TiposTransacciones.findByPk(id);
    if (!transaccion) {
      return res.status(404).json({ error: "Tipo transaccion no encontrado" });
    }

    await transaccion.destroy();
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
