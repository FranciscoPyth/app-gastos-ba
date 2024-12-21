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

module.exports = router;
