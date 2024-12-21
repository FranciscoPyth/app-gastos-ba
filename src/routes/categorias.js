const express = require('express');
const router = express.Router();
const { Categorias } = require('../models');
const { ValidationError } = require('sequelize');
const { Op } = require('sequelize');

// GET: Obtener todas las categorías con filtros opcionales
router.get('/', async (req, res) => {
  try {
    let where = {};

    // Obtener el usuario_id de los parámetros de consulta
    const usuario_id = req.query.usuario_id;

    if (!usuario_id) {
      return res.status(400).json({ error: 'Usuario no autenticado' });
    }

    // Agregar filtro para usuario_id
    where.usuario_id = usuario_id;

    if (req.query.descripcion) {
      where.descripcion = {
        [Op.like]: `%${req.query.descripcion}%`,
      };
    }

    let items = await Categorias.findAndCountAll({
      order: [['descripcion', 'ASC']],
      where,
    });

    res.json(items.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Obtener una categoría por ID
router.get('/:id', async (req, res) => {
  try {
    let id = req.params.id;
    let categoria = await Categorias.findByPk(id);
    if (!categoria) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }
    res.json(categoria);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST: Crear una nueva categoría
router.post('/', async (req, res) => {
  try {
    let nuevaCategoria = await Categorias.create(req.body);
    res.status(201).json(nuevaCategoria);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.errors.map(e => e.message) });
    }
    res.status(500).json({ error: error.message });
  }
});

// PUT: Actualizar una categoría existente por ID
router.put('/:id', async (req, res) => {
  try {
    let id = req.params.id;
    let categoria = await Categorias.findByPk(id);
    if (!categoria) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    let updatedCategoria = await categoria.update(req.body);
    res.json(updatedCategoria);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.errors.map(e => e.message) });
    }
    res.status(500).json({ error: error.message });
  }
});

// DELETE: Eliminar una categoría existente por ID
router.delete('/:id', async (req, res) => {
  try {
    let id = req.params.id;
    let categoria = await Categorias.findByPk(id);
    if (!categoria) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    await categoria.destroy();
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
