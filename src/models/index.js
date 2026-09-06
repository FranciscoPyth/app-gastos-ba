// src/models/index.js
const { Sequelize, DataTypes } = require('sequelize');
// Carga el .env del proyecto de forma independiente del cwd del proceso
// (en prod pm2 corre con cwd distinto a la carpeta del proyecto).
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const sequelize = new Sequelize(process.env.DB_DATABASE, process.env.DB_USERNAME, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306, // Puerto estándar de MySQL
  dialect: process.env.DB_DIALECT,
  logging: console.log, // Muestra logs detallados
  // Reintenta queries/conexiones ante microcortes de MySQL en vez de fallar.
  retry: {
    max: 5,
    match: [
      /ECONNREFUSED/, /ETIMEDOUT/, /ECONNRESET/, /EHOSTUNREACH/,
      /PROTOCOL_CONNECTION_LOST/,
      /SequelizeConnectionError/, /SequelizeConnectionRefusedError/,
      /SequelizeHostNotReachableError/, /SequelizeConnectionTimedOutError/,
    ],
  },
});


// Conexión inicial con reintentos y backoff. Un microcorte de MySQL al arranque
// NO debe tirar el proceso (antes hacía process.exit(1) y pm2 lo reiniciaba en loop).
async function connectWithRetry(attempt = 1) {
  const MAX_DELAY = 30000;
  try {
    await sequelize.authenticate();
    console.log('Conexión a la base de datos establecida con éxito.');
  } catch (error) {
    const delay = Math.min(2000 * attempt, MAX_DELAY);
    console.error(`No se pudo conectar a la base de datos (intento ${attempt}); reintento en ${delay}ms:`, error.message);
    setTimeout(() => connectWithRetry(attempt + 1), delay);
  }
}
connectWithRetry();

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

db.Divisas = require('./divisas')(sequelize, DataTypes);
db.TiposTransacciones = require('./tiposTransacciones')(sequelize, DataTypes);
db.MetodosPagos = require('./metodosPagos')(sequelize, DataTypes);
db.Categorias = require('./categorias')(sequelize, DataTypes);
db.Gastos = require('./gastos')(sequelize, DataTypes);
db.Usuarios = require('./usuarios')(sequelize, DataTypes);
db.GastosPruebaN8N = require('./gastosPruebaN8N')(sequelize, DataTypes);
db.UsuarioTelefonos = require('./usuarioTelefonos')(sequelize, DataTypes);
db.PhoneVerifications = require('./phoneVerifications')(sequelize, DataTypes);
db.ChatMessages = require('./chatMessages')(sequelize, DataTypes);
db.CuentasConciliables = require('./cuentasConciliables')(sequelize, DataTypes);
db.SaldosIniciales = require('./saldosIniciales')(sequelize, DataTypes);
db.Conciliaciones = require('./conciliaciones')(sequelize, DataTypes);

// Associations
db.Gastos.belongsTo(db.Divisas, { foreignKey: 'divisa_id', targetKey: 'id' });
db.Gastos.belongsTo(db.TiposTransacciones, { foreignKey: 'tipostransaccion_id', targetKey: 'id' });
db.Gastos.belongsTo(db.MetodosPagos, { foreignKey: 'metodopago_id', targetKey: 'id' });
db.Gastos.belongsTo(db.Categorias, { foreignKey: 'categoria_id', targetKey: 'id' });
db.Gastos.belongsTo(db.Usuarios, { foreignKey: 'usuario_id', targetKey: 'id' });
db.Categorias.belongsTo(db.Usuarios, { foreignKey: 'usuario_id', targetKey: 'id' });
db.Divisas.belongsTo(db.Usuarios, { foreignKey: 'usuario_id', targetKey: 'id' });
db.TiposTransacciones.belongsTo(db.Usuarios, { foreignKey: 'usuario_id', targetKey: 'id' });
db.MetodosPagos.belongsTo(db.Usuarios, { foreignKey: 'usuario_id', targetKey: 'id' });

db.CuentasConciliables.belongsTo(db.Usuarios, { foreignKey: 'usuario_id', targetKey: 'id' });
db.CuentasConciliables.belongsTo(db.MetodosPagos, { foreignKey: 'metodopago_id', targetKey: 'id' });
db.SaldosIniciales.belongsTo(db.MetodosPagos, { foreignKey: 'metodopago_id', targetKey: 'id' });
db.SaldosIniciales.belongsTo(db.Divisas, { foreignKey: 'divisa_id', targetKey: 'id' });
db.Conciliaciones.belongsTo(db.Usuarios, { foreignKey: 'usuario_id', targetKey: 'id' });
db.Conciliaciones.belongsTo(db.MetodosPagos, { foreignKey: 'metodopago_id', targetKey: 'id' });
db.Conciliaciones.belongsTo(db.Divisas, { foreignKey: 'divisa_id', targetKey: 'id' });
db.Gastos.belongsTo(db.Conciliaciones, { foreignKey: 'conciliacion_id', targetKey: 'id' });

// Relación Usuarios <-> UsuarioTelefonos
db.Usuarios.hasMany(db.UsuarioTelefonos, { foreignKey: 'usuario_id', as: 'telefonos_adicionales' });
db.UsuarioTelefonos.belongsTo(db.Usuarios, { foreignKey: 'usuario_id' });

db.Objetivos = require('./objetivos')(sequelize, DataTypes);
db.Objetivos.belongsTo(db.Usuarios, { foreignKey: 'user_id', targetKey: 'id' });

db.Prestamos = require('./prestamos')(sequelize, DataTypes);
db.Prestamos.belongsTo(db.Usuarios, { foreignKey: 'user_id', targetKey: 'id' });

db.Deudas = require('./deudas')(sequelize, DataTypes);
db.Deudas.belongsTo(db.Usuarios, { foreignKey: 'user_id', targetKey: 'id' });

db.Feedback = require('./feedback')(sequelize, DataTypes);
db.Feedback.belongsTo(db.Usuarios, { foreignKey: 'user_id', targetKey: 'id' });

db.Movimientos = require('./movimientos')(sequelize, DataTypes);
db.Movimientos.belongsTo(db.Usuarios, { foreignKey: 'user_id', targetKey: 'id' });

db.MercadoPagoCuentas = require('./mercadoPagoCuentas')(sequelize, DataTypes);
db.MercadoPagoCuentas.belongsTo(db.Usuarios, { foreignKey: 'user_id', targetKey: 'id' });

db.MercadoPagoEventos = require('./mercadoPagoEventos')(sequelize, DataTypes);
db.MercadoPagoEventos.belongsTo(db.Usuarios, { foreignKey: 'user_id', targetKey: 'id' });

db.TarjetasCredito = require('./tarjetasCredito')(sequelize, DataTypes);
db.TarjetasCredito.belongsTo(db.Usuarios, { foreignKey: 'user_id', targetKey: 'id' });
db.Gastos.belongsTo(db.TarjetasCredito, { foreignKey: 'tarjeta_id', targetKey: 'id' });

db.Suscripciones = require('./suscripciones')(sequelize, DataTypes);
db.Suscripciones.belongsTo(db.Usuarios, { foreignKey: 'user_id', targetKey: 'id' });
db.Suscripciones.belongsTo(db.TarjetasCredito, { foreignKey: 'tarjeta_id', targetKey: 'id' });

db.RecordatoriosReenganche = require('./recordatoriosReenganche')(sequelize, DataTypes);
db.RecordatoriosReenganche.belongsTo(db.Usuarios, { foreignKey: 'user_id', targetKey: 'id' });

db.TelegramLinkTokens = require('./telegramLinkTokens')(sequelize, DataTypes);
db.TelegramLinkTokens.belongsTo(db.Usuarios, { foreignKey: 'user_id', targetKey: 'id' });

db.PatrimonioPosiciones = require('./patrimonioPosiciones')(sequelize, DataTypes);
db.PatrimonioPosiciones.belongsTo(db.Usuarios, { foreignKey: 'user_id', targetKey: 'id' });

db.PatrimonioConfig = require('./patrimonioConfig')(sequelize, DataTypes);
db.PatrimonioConfig.belongsTo(db.Usuarios, { foreignKey: 'user_id', targetKey: 'id' });

db.PatrimonioSnapshots = require('./patrimonioSnapshots')(sequelize, DataTypes);
db.PatrimonioSnapshots.belongsTo(db.Usuarios, { foreignKey: 'user_id', targetKey: 'id' });

db.PresupuestoLineas = require('./presupuestoLineas')(sequelize, DataTypes);
db.PresupuestoLineas.belongsTo(db.Usuarios, { foreignKey: 'user_id', targetKey: 'id' });

db.ProyeccionConfig = require('./proyeccionConfig')(sequelize, DataTypes);
db.ProyeccionConfig.belongsTo(db.Usuarios, { foreignKey: 'user_id', targetKey: 'id' });

db.AgendaCategorias = require('./agendaCategorias')(sequelize, DataTypes);
db.AgendaCategorias.belongsTo(db.Usuarios, { foreignKey: 'user_id', targetKey: 'id' });

db.AgendaItems = require('./agendaItems')(sequelize, DataTypes);
db.AgendaItems.belongsTo(db.Usuarios, { foreignKey: 'user_id', targetKey: 'id' });

module.exports = db;
