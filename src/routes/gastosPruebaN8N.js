const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const { GastosPruebaN8N, Usuarios, UsuarioTelefonos } = require("../models");
const { ValidationError } = require("sequelize");
const apiKeyMiddleware = require("../security/apiKey");
const { authenticateJWT } = require("../security/auth");
const { normalizarTelefono } = require('../utils/phoneUtils');

// Middleware combinado: API Key o JWT
const combinedAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const validApiKey = process.env.API_KEY;

  // 1. Intentar con API Key (Acceso de Sistema/Admin)
  if (apiKey && apiKey === validApiKey) {
    req.isSystem = true;
    return next();
  }

  // 2. Si no es API Key, intentar con JWT (Acceso de Usuario)
  authenticateJWT(req, res, next);
};

// GET: Obtener todos los gastos de prueba con filtros opcionales
router.get("/", combinedAuth, async (req, res) => {
  try {
    let where = {};

    // --- LÓGICA DE FILTRADO POR USUARIO (Si no es sistema) ---
    if (!req.isSystem && res.locals.user) {
      const userId = res.locals.user.id;

      // 1. Obtener teléfonos del usuario (Principal + Adicionales)
      const usuario = await Usuarios.findByPk(userId, {
        include: [{ model: UsuarioTelefonos, as: 'telefonos_adicionales' }]
      });

      if (!usuario) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      let userPhones = [];

      // Agregar teléfono principal si existe
      if (usuario.telefono) {
        userPhones.push(usuario.telefono);
      }

      // Agregar teléfonos adicionales
      if (usuario.telefonos_adicionales && usuario.telefonos_adicionales.length > 0) {
        userPhones = userPhones.concat(usuario.telefonos_adicionales.map(t => t.telefono));
      }

      if (userPhones.length > 0) {
        // Filtrar gastos donde numero_cel coincida con alguno de los teléfonos del usuario
        // MODIFICACIÓN: Buscar tanto formato nuevo (549...) como viejo (local)
        const telefonosBusqueda = [];
        userPhones.forEach(phone => {
          telefonosBusqueda.push(phone); // Formato normalizado (debería ser 549...)

          // Agregar variante sin 549 por si hay datos viejos
          if (phone.startsWith('549')) {
            telefonosBusqueda.push(phone.substring(3));
          }
        });

        where.numero_cel = {
          [Op.in]: telefonosBusqueda
        };
      } else {
        // Si el usuario no tiene teléfonos, no debería ver gastos
        where.id = -1;
      }
    }
    // -------------------------------------------------------

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
      const telefonoNormalizado = normalizarTelefono(req.query.numero_cel);

      // Si ya hay un filtro de lista de teléfonos (usuario normal), verificamos intersección
      if (where.numero_cel && where.numero_cel[Op.in]) {
        // ... (lógica compleja existente, simplificar si es posible o adaptar)
        // Por ahora, para simplificar y asegurar compatibilidad:
        // Si el usuario busca un número específico, debe coincidir con alguno de sus permitidos.

        // Generamos variantes de búsqueda para soportar datos viejos (sin 549)
        const variantesBusqueda = [
          telefonoNormalizado,
          telefonoNormalizado.replace(/^549/, '') // Intento de quitar 549 para buscar en formato viejo
        ].filter(Boolean);

        where[Op.and] = [
          { numero_cel: where.numero_cel }, // Debe estar en su lista permitida
          (req.query.numero_cel_exacto === 'true')
            ? { numero_cel: { [Op.in]: variantesBusqueda } }
            : { numero_cel: { [Op.like]: "%" + telefonoNormalizado.replace(/^549/, '') + "%" } } // Buscamos por la parte local para ser más laxos
        ];
        delete where.numero_cel; // Eliminamos el filtro original de lista, ya que lo movimos al AND
      } else {
        // Busqueda admin o sistema sin restricción de usuario
        // Buscamos por ambas variantes para encontrar todo
        const numeroLocal = telefonoNormalizado.replace(/^549/, '');
        if (req.query.numero_cel_exacto === 'true') {
          where.numero_cel = { [Op.or]: [telefonoNormalizado, numeroLocal] };
        } else {
          where.numero_cel = { [Op.like]: "%" + numeroLocal + "%" };
        }
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
    let order = [["created_at", "DESC"]];

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
router.get("/:id", combinedAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const gasto = await GastosPruebaN8N.findByPk(id);

    if (!gasto) {
      return res.status(404).json({ error: "Gasto no encontrado" });
    }

    // Seguridad: Si es usuario normal, verificar que el gasto le pertenezca (por teléfono)
    if (!req.isSystem && res.locals.user) {
      // TODO: Implementar verificación de propiedad si es necesario
      // Por ahora, si el usuario tiene acceso a la lista filtrada, asumimos que puede ver el detalle
      // Pero sería bueno verificar que gasto.numero_cel esté en sus teléfonos.
    }

    res.json(gasto);
  } catch (error) {
    console.error("Error al obtener el gasto:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST: Crear un nuevo gasto (Protegido por API Key)
router.post("/", apiKeyMiddleware, async (req, res) => {
  try {
    console.log("Datos recibidos para nuevo gasto de prueba:", req.body);

    const camposRequeridos = ['descripcion', 'monto', 'fecha'];
    const camposFaltantes = camposRequeridos.filter(campo => !req.body[campo]);

    if (camposFaltantes.length > 0) {
      return res.status(400).json({
        error: `Campos requeridos faltantes: ${camposFaltantes.join(', ')} `
      });
    }

    const normalizarTelefonoLocal = (numero) => {
      return normalizarTelefono(numero);
    };

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

// PUT: Actualizar un gasto existente por ID (API Key o JWT)
router.put("/:id", combinedAuth, async (req, res) => {
  try {
    const id = req.params.id;
    let gasto = await GastosPruebaN8N.findByPk(id);

    if (!gasto) {
      return res.status(404).json({ error: "Gasto no encontrado" });
    }

    // --- SEGURIDAD: Verificar permisos si es usuario normal ---
    if (!req.isSystem && res.locals.user) {
      const userId = res.locals.user.id;

      // 1. Obtener teléfonos del usuario
      const usuario = await Usuarios.findByPk(userId, {
        include: [{ model: UsuarioTelefonos, as: 'telefonos_adicionales' }]
      });

      let userPhones = [];
      if (usuario.telefono) userPhones.push(usuario.telefono);
      if (usuario.telefonos_adicionales) {
        userPhones = userPhones.concat(usuario.telefonos_adicionales.map(t => t.telefono));
      }

      // 2. Verificar que el gasto pertenezca a uno de sus teléfonos
      if (!userPhones.includes(gasto.numero_cel)) {
        return res.status(403).json({ error: "No tienes permiso para editar este gasto" });
      }

      // 3. PROHIBIR modificar el número de teléfono
      if (req.body.numero_cel) {
        return res.status(400).json({ error: "No puedes modificar el número de teléfono asociado al gasto" });
      }
    }
    // ----------------------------------------------------------

    // Normalizar número de teléfono si se está actualizando (Solo permitido para Sistema)
    if (req.isSystem && req.body.numero_cel) {
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

// DELETE: Eliminar un gasto existente por ID (Protegido por API Key)
router.delete("/:id", apiKeyMiddleware, async (req, res) => {
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