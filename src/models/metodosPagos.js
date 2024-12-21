// backend/src/models/metodosPago.js

module.exports = (sequelize, DataTypes) => {
  const MetodosPagos = sequelize.define('MetodosPagos', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    descripcion: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      references: {
        model: 'Usuarios',
        key: 'id'
      }
    }
  }, { timestamps: false });
  return MetodosPagos;
};
