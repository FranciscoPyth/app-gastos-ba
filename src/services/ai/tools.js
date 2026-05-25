// Tools del agente IA. Cada tool conoce su endpoint backend y se invoca con
// API key interna. Tools de consulta in-process (sin HTTP) acceden directo a
// Sequelize para evitar round-trips innecesarios.
const axios = require('axios');
const { Op } = require('sequelize');
const db = require('../../models');
const { enrichTarjeta, getResumenPeriodo } = require('../../utils/tarjetas');

const INTERNAL_BASE = process.env.INTERNAL_API_BASE || `http://localhost:${process.env.PORT || 4000}`;

function apiHeaders() {
  return {
    'x-api-key': process.env.API_KEY,
    'Content-Type': 'application/json'
  };
}

const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'registrar_gasto',
      description: 'Registra un gasto o ingreso. Si fue con tarjeta de crédito, pasá tarjeta (nombre o ID) y cuotas. Las compras con tarjeta NO descuentan el balance cash hasta que se paga el resumen.',
      parameters: {
        type: 'object',
        required: ['descripcion', 'monto', 'divisa', 'tipos_transaccion', 'metodo_pago', 'categoria'],
        properties: {
          descripcion: { type: 'string', description: 'Descripción breve del movimiento. Ej: "Almuerzo en McDonalds".' },
          monto: { type: 'number', description: 'MONTO TOTAL de la compra (no la cuota individual). Si el usuario dijo "9 cuotas de $14.444,33", el monto es 9×14444.33 = 129998.97. SIEMPRE multiplicar antes de pasar el valor.' },
          divisa: { type: 'string', description: 'ARS, USD, EUR, etc.' },
          tipos_transaccion: { type: 'string', enum: ['Ingreso', 'Egreso', 'Gasto'], description: 'Ingreso o Egreso/Gasto.' },
          metodo_pago: { type: 'string', description: 'Efectivo, Mercado Pago, Transferencia, nombre de tarjeta, etc.' },
          categoria: { type: 'string', description: 'Categoría del usuario (Comida, Transporte, Sueldo, etc).' },
          fecha: { type: 'string', description: 'Fecha YYYY-MM-DD. Si no se indica usar hoy.' },
          tarjeta: { type: 'string', description: 'Nombre fuzzy de la tarjeta si la compra fue con tarjeta de crédito. Antes hacé buscar_entidad si dudás.' },
          cuotas: { type: 'number', description: 'Cantidad de cuotas (default 1). Solo aplica con tarjeta.' },
          cuotas_pagadas: { type: 'number', description: 'Cuotas YA cobradas antes de hoy. Si user dice "cuota 5 de 6" → 4. Si la compra es nueva (cuota 1/N) → 0. Default 0.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'crear_deuda',
      description: 'Crea una nueva deuda (plata que el usuario debe a alguien o a un banco). Usar cuando el user dice "tomé una deuda", "saqué un crédito", "me prestaron".',
      parameters: {
        type: 'object',
        required: ['nombre_acreedor', 'monto_original', 'divisa'],
        properties: {
          nombre_acreedor: { type: 'string', description: 'Quien presta. Ej: "Banco Galicia", "Juan".' },
          monto_original: { type: 'number', description: 'Monto total de la deuda al inicio.' },
          divisa: { type: 'string', description: 'ARS, USD, EUR.' },
          pago_mensual: { type: 'number', description: 'Cuota mensual si la conocés.' },
          cantidad_cuotas: { type: 'number', description: 'Cantidad de cuotas (1 si pago único).' },
          tasa_interes: { type: 'number', description: 'Tasa anual % si aplica.' },
          origen: { type: 'string', description: 'Banco, Tarjeta, Amigo, Familia, Otro.' },
          descripcion: { type: 'string', description: 'Para qué se tomó la deuda. Opcional.' },
          fecha_fin: { type: 'string', description: 'Fecha YYYY-MM-DD de vencimiento si la sabés.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'pagar_deuda',
      description: 'Registra el pago de una cuota o abono a una deuda existente. Antes de usar esta tool, llamá a buscar_entidad si no sabés el ID.',
      parameters: {
        type: 'object',
        required: ['deuda_id', 'monto'],
        properties: {
          deuda_id: { type: 'number', description: 'ID de la deuda (obtenelo con buscar_entidad).' },
          monto: { type: 'number', description: 'Monto que se pagó.' },
          fecha: { type: 'string', description: 'Fecha YYYY-MM-DD del pago. Default: hoy.' },
          marcar_cerrada: { type: 'boolean', description: 'true si el usuario indica que terminó de pagar.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'crear_prestamo',
      description: 'Registra que el usuario le prestó plata a otra persona. NO confundir con tomar deuda. Usar cuando el user dice "le presté a X".',
      parameters: {
        type: 'object',
        required: ['nombre_persona', 'monto_original', 'divisa'],
        properties: {
          nombre_persona: { type: 'string', description: 'A quién le prestó. Ej: "Juan".' },
          monto_original: { type: 'number', description: 'Monto prestado.' },
          divisa: { type: 'string', description: 'ARS, USD, EUR.' },
          fecha_vencimiento: { type: 'string', description: 'YYYY-MM-DD si el user dice cuándo se lo debe devolver.' },
          descripcion: { type: 'string', description: 'Para qué fue el préstamo. Opcional.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cobrar_prestamo',
      description: 'Registra el cobro de una devolución de préstamo. Antes llamá a buscar_entidad para el ID.',
      parameters: {
        type: 'object',
        required: ['prestamo_id', 'monto'],
        properties: {
          prestamo_id: { type: 'number', description: 'ID del préstamo.' },
          monto: { type: 'number', description: 'Cuánto le devolvieron.' },
          fecha: { type: 'string', description: 'YYYY-MM-DD del cobro. Default: hoy.' },
          marcar_pagado: { type: 'boolean', description: 'true si terminó de cobrar todo.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'crear_objetivo',
      description: 'Crea un nuevo objetivo de ahorro (un "pot" para guardar plata para algo).',
      parameters: {
        type: 'object',
        required: ['nombre', 'monto_objetivo', 'divisa'],
        properties: {
          nombre: { type: 'string', description: 'Nombre del objetivo. Ej: "Viaje a Brasil".' },
          monto_objetivo: { type: 'number', description: 'Meta total a ahorrar.' },
          divisa: { type: 'string', description: 'ARS, USD, EUR.' },
          fecha_limite: { type: 'string', description: 'YYYY-MM-DD si tiene deadline.' },
          descripcion: { type: 'string', description: 'Descripción opcional.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'aportar_objetivo',
      description: 'Aporta (o retira con tipo="retiro") plata a un objetivo de ahorro existente. Llamá antes buscar_entidad.',
      parameters: {
        type: 'object',
        required: ['objetivo_id', 'monto'],
        properties: {
          objetivo_id: { type: 'number', description: 'ID del objetivo.' },
          monto: { type: 'number', description: 'Monto a aportar/retirar.' },
          tipo: { type: 'string', enum: ['aporte', 'retiro'], description: 'Default: aporte.' },
          fecha: { type: 'string', description: 'YYYY-MM-DD. Default: hoy.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'buscar_entidad',
      description: 'Busca deudas/préstamos/objetivos por nombre fuzzy (tokens separados por espacios). Devuelve coincidencias con su ID y saldo actual. SIEMPRE llamá esto ANTES de pagar_deuda, cobrar_prestamo, aportar_objetivo, o actualizar_*. Si devuelve [] (vacío), la entidad NO existe — informalo al usuario y NO inventes.',
      parameters: {
        type: 'object',
        required: ['tipo', 'nombre'],
        properties: {
          tipo: { type: 'string', enum: ['deuda', 'prestamo', 'objetivo'], description: 'Tipo de entidad a buscar.' },
          nombre: { type: 'string', description: 'Nombre o parte del nombre. Múltiples palabras matchean cada una.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'actualizar_deuda',
      description: 'Modifica datos de una deuda existente (nombre, monto_original, divisa, cuotas, tasas, fechas, etc.). NO modifica saldo_restante directamente — eso se hace con pagar_deuda. Antes llamá buscar_entidad.',
      parameters: {
        type: 'object',
        required: ['deuda_id'],
        properties: {
          deuda_id: { type: 'number' },
          nombre_acreedor: { type: 'string' },
          monto_original: { type: 'number', description: 'Nuevo monto original. Si el saldo restante actual supera el nuevo monto, se ajusta automáticamente.' },
          divisa: { type: 'string' },
          pago_mensual: { type: 'number' },
          cantidad_cuotas: { type: 'number' },
          tasa_interes: { type: 'number' },
          fecha_fin: { type: 'string', description: 'YYYY-MM-DD' },
          descripcion: { type: 'string' },
          origen: { type: 'string' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'actualizar_prestamo',
      description: 'Modifica datos de un préstamo existente. Antes llamá buscar_entidad.',
      parameters: {
        type: 'object',
        required: ['prestamo_id'],
        properties: {
          prestamo_id: { type: 'number' },
          nombre_persona: { type: 'string' },
          monto_original: { type: 'number' },
          divisa: { type: 'string' },
          fecha_vencimiento: { type: 'string' },
          descripcion: { type: 'string' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'actualizar_objetivo',
      description: 'Modifica datos de un objetivo de ahorro (nombre, meta total, divisa, deadline). NO modifica monto_actual — eso se hace con aportar_objetivo. Antes llamá buscar_entidad.',
      parameters: {
        type: 'object',
        required: ['objetivo_id'],
        properties: {
          objetivo_id: { type: 'number' },
          nombre: { type: 'string' },
          monto_objetivo: { type: 'number', description: 'Nueva meta total.' },
          divisa: { type: 'string' },
          fecha_limite: { type: 'string', description: 'YYYY-MM-DD' },
          descripcion: { type: 'string' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consultar_estado_financiero',
      description: 'Devuelve lista de deudas, préstamos y objetivos activos del usuario con saldos. Usar para resúmenes globales.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consultar_balance_mes',
      description: 'Total de ingresos vs egresos del mes (o de un rango). Devuelve resumen por divisa.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'YYYY-MM-DD inicio. Default: primer día del mes actual.' },
          to: { type: 'string', description: 'YYYY-MM-DD fin. Default: hoy.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consultar_movimientos',
      description: 'Lista últimos N movimientos del usuario. Para preguntas tipo "cuánto gasté en transporte" filtrá luego en tu respuesta.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Cuántos traer (default 20, máx 100).' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'crear_tarjeta',
      description: 'Registra una nueva tarjeta de crédito. Pedile al usuario el nombre, día que cierra (1-31), día que vence el pago (1-31), opcional últimos 4 dígitos y límite.',
      parameters: {
        type: 'object',
        required: ['nombre', 'dia_cierre', 'dia_vencimiento'],
        properties: {
          nombre: { type: 'string', description: 'Ej: "Visa Galicia"' },
          dia_cierre: { type: 'number', description: 'Día del mes en que cierra (1-31).' },
          dia_vencimiento: { type: 'number', description: 'Día del mes en que vence el pago del resumen (1-31).' },
          ultimos_4: { type: 'string', description: 'Últimos 4 dígitos (opcional).' },
          divisa_resumen: { type: 'string', description: 'Divisa del resumen (default ARS).' },
          limite: { type: 'number', description: 'Límite de crédito (opcional).' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consultar_tarjetas',
      description: 'Lista todas las tarjetas activas del usuario con próximo cierre, próximo vencimiento y consumo del período actual.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consultar_tarjetas_proximas',
      description: 'Devuelve tarjetas que cierran o vencen en los próximos N días (default 7). Útil cuando el usuario pregunta "qué tengo que pagar pronto?" o "qué tarjetas vencen?".',
      parameters: {
        type: 'object',
        properties: {
          dias: { type: 'number', description: 'Cuántos días mirar adelante (default 7).' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'resumen_tarjeta',
      description: 'Detalle del período actual de una tarjeta: todas las compras + cuotas que caen en el período + total a pagar. Antes llamá buscar_tarjeta.',
      parameters: {
        type: 'object',
        required: ['tarjeta_id'],
        properties: {
          tarjeta_id: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'pagar_resumen_tarjeta',
      description: 'Registra el pago del resumen de una tarjeta como egreso real. Antes llamá buscar_tarjeta para el ID.',
      parameters: {
        type: 'object',
        required: ['tarjeta_id', 'monto'],
        properties: {
          tarjeta_id: { type: 'number' },
          monto: { type: 'number', description: 'Monto que se pagó.' },
          fecha: { type: 'string', description: 'YYYY-MM-DD. Default: hoy.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'buscar_tarjeta',
      description: 'Busca tarjetas de crédito del usuario por nombre fuzzy (multi-token). Devuelve coincidencias con su ID. Llamá esto antes de resumen_tarjeta o pagar_resumen_tarjeta.',
      parameters: {
        type: 'object',
        required: ['nombre'],
        properties: {
          nombre: { type: 'string', description: 'Nombre o parte del nombre de la tarjeta.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'crear_suscripcion',
      description: 'Registra una suscripción recurrente mensual (Netflix, Apple, Claude.AI, Google Workspace, Spotify, gimnasio, etc.). NO genera egreso inmediato — el cobro real se materializa cuando se paga el resumen de la tarjeta vinculada. Para cada suscripción que mencione el usuario hacé UNA llamada separada, incluyendo USD u otras divisas.',
      parameters: {
        type: 'object',
        required: ['descripcion', 'monto', 'divisa', 'dia_cobro'],
        properties: {
          descripcion: { type: 'string', description: 'Nombre de la suscripción. Ej: "Apple", "Claude.AI", "Spotify".' },
          monto: { type: 'number', description: 'Monto mensual.' },
          divisa: { type: 'string', description: 'ARS, USD, EUR, etc.' },
          dia_cobro: { type: 'number', description: 'Día del mes en que se cobra (1-31).' },
          tarjeta: { type: 'string', description: 'Nombre fuzzy de la tarjeta con la que se cobra. Opcional para débito automático/efectivo.' },
          metodo_pago: { type: 'string', description: 'Solo si NO se cobra con tarjeta. Ej: "Débito automático".' },
          categoria: { type: 'string', description: 'Default "Suscripciones".' },
          fecha_inicio: { type: 'string', description: 'YYYY-MM-DD. Default: hoy.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'consultar_suscripciones',
      description: 'Lista las suscripciones del usuario con su monto, día de cobro, tarjeta y estado.',
      parameters: {
        type: 'object',
        properties: {
          estado: { type: 'string', description: 'Filtrar por estado: activa | pausada | cancelada. Default: todas.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cancelar_suscripcion',
      description: 'Cancela (soft delete) una suscripción. Antes pedile el ID con consultar_suscripciones o usá ese nombre exacto.',
      parameters: {
        type: 'object',
        required: ['suscripcion_id'],
        properties: {
          suscripcion_id: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'editar_suscripcion',
      description: 'Actualiza campos de una suscripción (monto, día, tarjeta, estado activa/pausada). Antes consultar_suscripciones.',
      parameters: {
        type: 'object',
        required: ['suscripcion_id'],
        properties: {
          suscripcion_id: { type: 'number' },
          monto: { type: 'number' },
          divisa: { type: 'string' },
          dia_cobro: { type: 'number' },
          tarjeta: { type: 'string', description: 'Nombre fuzzy de tarjeta nueva.' },
          estado: { type: 'string', description: 'activa | pausada | cancelada' }
        }
      }
    }
  }
];

// ---------- helpers in-process ----------

async function buscarEntidad({ tipo, nombre }, { userId }) {
  if (!userId) return { error: 'No se pudo identificar al usuario' };

  // Tokenizar el nombre buscado y matchear cada token con AND (más permisivo)
  // Ej: "ahorros guadi" → matchea "Ahorros Guadi", "Ahorros para Guadi", etc.
  const tokens = String(nombre).toLowerCase().split(/\s+/).filter(t => t.length >= 2);
  const buildAnd = (column) => {
    if (tokens.length === 0) return { [column]: { [Op.like]: `%${nombre.toLowerCase()}%` } };
    return { [Op.and]: tokens.map(t => ({ [column]: { [Op.like]: `%${t}%` } })) };
  };

  if (tipo === 'deuda') {
    const rows = await db.Deudas.findAll({
      where: { user_id: userId, ...buildAnd('nombre_acreedor') },
      limit: 10
    });
    return rows.map(r => ({
      tipo: 'deuda', id: r.id, nombre: r.nombre_acreedor,
      saldo_restante: r.saldo_restante, monto_original: r.monto_original,
      divisa: r.divisa, estado: r.estado
    }));
  }
  if (tipo === 'prestamo') {
    const rows = await db.Prestamos.findAll({
      where: { user_id: userId, ...buildAnd('nombre_persona') }, limit: 10
    });
    return rows.map(r => ({
      tipo: 'prestamo', id: r.id, nombre: r.nombre_persona,
      saldo_restante: r.saldo_restante, monto_original: r.monto_original,
      divisa: r.divisa, estado: r.estado
    }));
  }
  if (tipo === 'objetivo') {
    const rows = await db.Objetivos.findAll({
      where: { user_id: userId, ...buildAnd('nombre') }, limit: 10
    });
    return rows.map(r => ({
      tipo: 'objetivo', id: r.id, nombre: r.nombre,
      monto_actual: r.monto_actual, monto_objetivo: r.monto_objetivo,
      divisa: r.divisa, estado: r.estado
    }));
  }
  return { error: 'Tipo desconocido' };
}

async function consultarBalanceMes({ from, to }, { userId, numero_cel }) {
  const today = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = new Date();
  firstDayOfMonth.setDate(1);
  const fromDate = from || firstDayOfMonth.toISOString().split('T')[0];
  const toDate = to || today;

  const where = { fecha: { [Op.between]: [fromDate, toDate] } };
  const [gastos, gastosN8N] = await Promise.all([
    db.Gastos.findAll({ where: { ...where, usuario_id: userId } }),
    db.GastosPruebaN8N.findAll({ where: { ...where, numero_cel } })
  ]);

  const byCurrency = {};
  const addRow = (divisa, tipo, monto) => {
    const cur = (divisa || 'ARS').toUpperCase();
    byCurrency[cur] = byCurrency[cur] || { ingresos: 0, egresos: 0 };
    const isIngreso = String(tipo || '').toLowerCase().includes('ingreso');
    if (isIngreso) byCurrency[cur].ingresos += parseFloat(monto || 0);
    else byCurrency[cur].egresos += parseFloat(monto || 0);
  };

  for (const g of gastos) addRow(g.Divisa?.descripcion || 'ARS', g.tipo_transaccion, g.monto);
  for (const g of gastosN8N) addRow(g.divisa, g.tipos_transaccion, g.monto);

  return { from: fromDate, to: toDate, por_divisa: byCurrency };
}

async function runTool(name, args, ctx) {
  const { numero_cel, userId } = ctx;

  // Tools in-process
  if (name === 'buscar_entidad') return buscarEntidad(args, ctx);
  if (name === 'consultar_balance_mes') return consultarBalanceMes(args, ctx);

  // Tools que pegan a HTTP interno
  if (name === 'registrar_gasto') {
    // Si vino tarjeta como string, resolverla a ID
    let tarjeta_id = null;
    if (args.tarjeta && userId) {
      const tokens = String(args.tarjeta).toLowerCase().split(/\s+/).filter(t => t.length >= 2);
      const tarjetas = await db.TarjetasCredito.findAll({
        where: {
          user_id: userId,
          ...(tokens.length ? { [Op.and]: tokens.map(t => ({ nombre: { [Op.like]: `%${t}%` } })) } : {})
        }, limit: 1
      });
      if (tarjetas.length) tarjeta_id = tarjetas[0].id;
    }

    const body = {
      descripcion: args.descripcion,
      monto: args.monto,
      fecha: args.fecha || new Date().toISOString().split('T')[0],
      numero_cel,
      divisa: args.divisa,
      tipos_transaccion: args.tipos_transaccion,
      metodo_pago: args.metodo_pago,
      categoria: args.categoria,
      tarjeta_id,
      cuotas_total: args.cuotas || 1,
      cuotas_pagadas: args.cuotas_pagadas || 0
    };
    const r = await axios.post(`${INTERNAL_BASE}/api/gastosPruebaN8N/`, body, { headers: apiHeaders() });
    return r.data;
  }

  if (name === 'crear_deuda') {
    const body = {
      numero_cel,
      creditorName: args.nombre_acreedor,
      loanAmount: args.monto_original,
      currency: args.divisa,
      monthlyPayment: args.pago_mensual,
      installments: args.cantidad_cuotas,
      interestRate: args.tasa_interes,
      source: args.origen,
      description: args.descripcion,
      dueDate: args.fecha_fin
    };
    const r = await axios.post(`${INTERNAL_BASE}/api/ia-integration/deudas`, body, { headers: apiHeaders() });
    return r.data;
  }

  if (name === 'pagar_deuda') {
    const r = await axios.put(`${INTERNAL_BASE}/api/ia-integration/deudas/${args.deuda_id}/abonar`, {
      numero_cel,
      monto_abono: args.monto,
      marcar_cerrada: !!args.marcar_cerrada
    }, { headers: apiHeaders() });
    return r.data;
  }

  if (name === 'crear_prestamo') {
    const r = await axios.post(`${INTERNAL_BASE}/api/ia-integration/prestamos`, {
      numero_cel,
      personName: args.nombre_persona,
      amount: args.monto_original,
      currency: args.divisa,
      dueDate: args.fecha_vencimiento,
      description: args.descripcion
    }, { headers: apiHeaders() });
    return r.data;
  }

  if (name === 'cobrar_prestamo') {
    const r = await axios.put(`${INTERNAL_BASE}/api/ia-integration/prestamos/${args.prestamo_id}/abonar`, {
      numero_cel,
      monto_abono: args.monto,
      marcar_pagado: !!args.marcar_pagado
    }, { headers: apiHeaders() });
    return r.data;
  }

  if (name === 'crear_objetivo') {
    const r = await axios.post(`${INTERNAL_BASE}/api/ia-integration/objetivos`, {
      numero_cel,
      nombre: args.nombre,
      monto_objetivo: args.monto_objetivo,
      divisa: args.divisa,
      fecha_limite: args.fecha_limite,
      descripcion: args.descripcion
    }, { headers: apiHeaders() });
    return r.data;
  }

  if (name === 'actualizar_deuda') {
    const { deuda_id, ...rest } = args;
    const r = await axios.put(`${INTERNAL_BASE}/api/ia-integration/deudas/${deuda_id}`, {
      numero_cel, ...rest
    }, { headers: apiHeaders() });
    return r.data;
  }

  if (name === 'actualizar_prestamo') {
    const { prestamo_id, ...rest } = args;
    const r = await axios.put(`${INTERNAL_BASE}/api/ia-integration/prestamos/${prestamo_id}`, {
      numero_cel, ...rest
    }, { headers: apiHeaders() });
    return r.data;
  }

  if (name === 'actualizar_objetivo') {
    const { objetivo_id, ...rest } = args;
    const r = await axios.put(`${INTERNAL_BASE}/api/ia-integration/objetivos/${objetivo_id}`, {
      numero_cel, ...rest
    }, { headers: apiHeaders() });
    return r.data;
  }

  if (name === 'aportar_objetivo') {
    const r = await axios.put(`${INTERNAL_BASE}/api/ia-integration/objetivos/${args.objetivo_id}/abonar`, {
      numero_cel,
      monto_abono: args.monto,
      tipo: args.tipo === 'retiro' ? 'retiro' : 'aporte'
    }, { headers: apiHeaders() });
    return r.data;
  }

  if (name === 'consultar_estado_financiero') {
    const r = await axios.get(
      `${INTERNAL_BASE}/api/ia-integration/estado-financiero?numero_cel=${encodeURIComponent(numero_cel)}`,
      { headers: apiHeaders() }
    );
    return r.data;
  }

  if (name === 'consultar_movimientos') {
    const limit = args.limit || 20;
    const url = `${INTERNAL_BASE}/api/gastosPruebaN8N/?numero_cel=${encodeURIComponent(numero_cel)}&order_by=fecha&order_direction=DESC&limit=${limit}`;
    const r = await axios.get(url, { headers: apiHeaders() });
    return r.data;
  }

  // ---------- TARJETAS ----------
  if (name === 'crear_tarjeta') {
    if (!userId) return { error: 'No se pudo identificar al usuario' };
    const t = await db.TarjetasCredito.create({
      user_id: userId,
      nombre: args.nombre,
      ultimos_4: args.ultimos_4 || null,
      divisa_resumen: args.divisa_resumen || 'ARS',
      dia_cierre: parseInt(args.dia_cierre),
      dia_vencimiento: parseInt(args.dia_vencimiento),
      limite: args.limite ? parseFloat(args.limite) : null,
      estado: 'activa'
    });
    return await enrichTarjeta(t);
  }

  if (name === 'buscar_tarjeta') {
    if (!userId) return { error: 'No se pudo identificar al usuario' };
    const tokens = String(args.nombre).toLowerCase().split(/\s+/).filter(t => t.length >= 2);
    const where = {
      user_id: userId,
      ...(tokens.length ? { [Op.and]: tokens.map(t => ({ nombre: { [Op.like]: `%${t}%` } })) } : { nombre: { [Op.like]: `%${args.nombre.toLowerCase()}%` } })
    };
    const rows = await db.TarjetasCredito.findAll({ where, limit: 5 });
    return rows.map(r => ({
      id: r.id, nombre: r.nombre, ultimos_4: r.ultimos_4,
      divisa_resumen: r.divisa_resumen, dia_cierre: r.dia_cierre, dia_vencimiento: r.dia_vencimiento,
      estado: r.estado
    }));
  }

  if (name === 'consultar_tarjetas') {
    if (!userId) return { error: 'No se pudo identificar al usuario' };
    const tarjetas = await db.TarjetasCredito.findAll({ where: { user_id: userId, estado: 'activa' } });
    return await Promise.all(tarjetas.map(t => enrichTarjeta(t)));
  }

  if (name === 'consultar_tarjetas_proximas') {
    if (!userId) return { error: 'No se pudo identificar al usuario' };
    const dias = args.dias || 7;
    const tarjetas = await db.TarjetasCredito.findAll({ where: { user_id: userId, estado: 'activa' } });
    const enriched = await Promise.all(tarjetas.map(t => enrichTarjeta(t)));
    return enriched.filter(t => t.dias_al_cierre <= dias || t.dias_al_vencimiento <= dias);
  }

  if (name === 'resumen_tarjeta') {
    if (!userId) return { error: 'No se pudo identificar al usuario' };
    const t = await db.TarjetasCredito.findOne({ where: { id: args.tarjeta_id, user_id: userId } });
    if (!t) return { error: 'Tarjeta no encontrada' };
    return await getResumenPeriodo(t);
  }

  if (name === 'pagar_resumen_tarjeta') {
    if (!userId) return { error: 'No se pudo identificar al usuario' };
    const t = await db.TarjetasCredito.findOne({ where: { id: args.tarjeta_id, user_id: userId } });
    if (!t) return { error: 'Tarjeta no encontrada' };
    const monto = parseFloat(args.monto);
    if (!monto || monto <= 0) return { error: 'monto inválido' };
    const fecha = args.fecha || new Date().toISOString().split('T')[0];
    const gasto = await db.GastosPruebaN8N.create({
      numero_cel,
      descripcion: `Pago resumen tarjeta: ${t.nombre}`,
      monto,
      fecha,
      divisa: t.divisa_resumen || 'ARS',
      tipos_transaccion: 'Gasto',
      metodo_pago: t.nombre,
      categoria: 'Pago Tarjeta'
    });
    return { ok: true, gasto, tarjeta: t.nombre };
  }

  // ---------- SUSCRIPCIONES ----------
  // Helper: resolver tarjeta fuzzy por nombre
  async function resolveTarjetaIdFromName(nombre) {
    if (!nombre || !userId) return null;
    const tokens = String(nombre).toLowerCase().split(/\s+/).filter(t => t.length >= 2);
    const t = await db.TarjetasCredito.findOne({
      where: {
        user_id: userId,
        ...(tokens.length ? { [Op.and]: tokens.map(tk => ({ nombre: { [Op.like]: `%${tk}%` } })) } : { nombre: { [Op.like]: `%${nombre.toLowerCase()}%` } })
      }
    });
    return t ? t.id : null;
  }

  if (name === 'crear_suscripcion') {
    if (!userId) return { error: 'No se pudo identificar al usuario' };
    const tarjeta_id = args.tarjeta ? await resolveTarjetaIdFromName(args.tarjeta) : null;
    const s = await db.Suscripciones.create({
      user_id: userId,
      descripcion: args.descripcion,
      monto: parseFloat(args.monto),
      divisa: args.divisa,
      dia_cobro: parseInt(args.dia_cobro),
      tarjeta_id,
      metodo_pago: args.metodo_pago || null,
      categoria: args.categoria || 'Suscripciones',
      fecha_inicio: args.fecha_inicio || new Date().toISOString().split('T')[0],
      fecha_fin: null,
      estado: 'activa'
    });
    return { ok: true, suscripcion: s, tarjeta_resuelta: tarjeta_id };
  }

  if (name === 'consultar_suscripciones') {
    if (!userId) return { error: 'No se pudo identificar al usuario' };
    const where = { user_id: userId };
    if (args.estado) where.estado = args.estado;
    const rows = await db.Suscripciones.findAll({
      where,
      order: [['estado', 'ASC'], ['dia_cobro', 'ASC']]
    });
    return rows;
  }

  if (name === 'cancelar_suscripcion') {
    if (!userId) return { error: 'No se pudo identificar al usuario' };
    const s = await db.Suscripciones.findOne({ where: { id: args.suscripcion_id, user_id: userId } });
    if (!s) return { error: 'Suscripción no encontrada' };
    await s.update({ estado: 'cancelada', fecha_fin: new Date().toISOString().split('T')[0] });
    return { ok: true, suscripcion: s };
  }

  if (name === 'editar_suscripcion') {
    if (!userId) return { error: 'No se pudo identificar al usuario' };
    const s = await db.Suscripciones.findOne({ where: { id: args.suscripcion_id, user_id: userId } });
    if (!s) return { error: 'Suscripción no encontrada' };
    const updates = {};
    if (args.monto != null) updates.monto = parseFloat(args.monto);
    if (args.divisa) updates.divisa = args.divisa;
    if (args.dia_cobro != null) updates.dia_cobro = parseInt(args.dia_cobro);
    if (args.estado) updates.estado = args.estado;
    if (args.tarjeta !== undefined) {
      updates.tarjeta_id = args.tarjeta ? await resolveTarjetaIdFromName(args.tarjeta) : null;
    }
    await s.update(updates);
    return { ok: true, suscripcion: s };
  }

  throw new Error(`Tool desconocida: ${name}`);
}

module.exports = { toolDefinitions, runTool };
