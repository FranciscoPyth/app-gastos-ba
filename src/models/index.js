// src/models/index.js
const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.DB_DATABASE, process.env.DB_USERNAME, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306, // Puerto estándar de MySQL
  dialect: process.env.DB_DIALECT,
  logging: console.log, // Muestra logs detallados
});


// Probar la conexión
(async () => {
  try {
    await sequelize.authenticate();
    console.log('Conexión a la base de datos establecida con éxito.');
  } catch (error) {
    console.error('No se pudo conectar a la base de datos:', error);
    process.exit(1);
  }
})();

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

module.exports = db;
