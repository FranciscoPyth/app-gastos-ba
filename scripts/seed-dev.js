// Seed para ambiente local de desarrollo.
// Crea catálogos base + 1 usuario demo. Idempotente: si ya existen, no duplica.
//
// Uso:
//   node -r ./scripts/load-local-env scripts/seed-dev.js
//
// O via npm: npm run seed:dev

const bcrypt = require('bcrypt');
const db = require('../src/models');

const DEMO_USER = {
  username: 'demo',
  email: 'demo@local.test',
  password: 'demo1234',
  telefono: '+5491100000000',
  has_completed_onboarding: true,
};

const CATALOGS = {
  divisas: ['ARS', 'USD', 'EUR'],
  tipos: ['Ingreso', 'Gasto', 'Ahorro'],
  metodos: ['Efectivo', 'Transferencia', 'Tarjeta Débito', 'Tarjeta Crédito', 'Mercado Pago'],
  categorias: [
    'Comida', 'Transporte', 'Servicios', 'Ocio', 'Salud',
    'Sueldo', 'Préstamos', 'Deudas', 'Ahorro/Objetivo',
    'Cobros MP', 'Pagos MP', 'Otros',
  ],
};

async function upsertCatalog(Model, descripcion, usuario_id) {
  const [row] = await Model.findOrCreate({
    where: { descripcion, usuario_id },
    defaults: { descripcion, usuario_id },
  });
  return row;
}

async function run() {
  try {
    await db.sequelize.sync({ alter: true });
    console.log('[seed] Schema sincronizado.');

    // Demo user
    let user = await db.Usuarios.findOne({ where: { email: DEMO_USER.email } });
    if (!user) {
      const hash = await bcrypt.hash(DEMO_USER.password, 10);
      user = await db.Usuarios.create({
        username: DEMO_USER.username,
        email: DEMO_USER.email,
        password: hash,
        telefono: DEMO_USER.telefono,
        has_completed_onboarding: true,
      });
      console.log(`[seed] Usuario demo creado: ${DEMO_USER.email} (id=${user.id})`);
    } else {
      console.log(`[seed] Usuario demo ya existe: ${DEMO_USER.email} (id=${user.id})`);
    }

    // Catálogos asociados al user demo
    for (const d of CATALOGS.divisas) await upsertCatalog(db.Divisas, d, user.id);
    for (const t of CATALOGS.tipos) await upsertCatalog(db.TiposTransacciones, t, user.id);
    for (const m of CATALOGS.metodos) await upsertCatalog(db.MetodosPagos, m, user.id);
    for (const c of CATALOGS.categorias) await upsertCatalog(db.Categorias, c, user.id);

    console.log('[seed] Catálogos cargados.');
    console.log('');
    console.log('================================');
    console.log('  CREDENCIALES DEMO');
    console.log('  email:    demo@local.test');
    console.log('  password: demo1234');
    console.log('  telefono: +5491100000000');
    console.log('================================');

    process.exit(0);
  } catch (err) {
    console.error('[seed] Error:', err);
    process.exit(1);
  }
}

run();
