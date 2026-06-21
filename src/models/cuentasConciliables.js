module.exports = (sequelize, DataTypes) => {
  const CuentasConciliables = sequelize.define('CuentasConciliables', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    usuario_id: { type: DataTypes.INTEGER, allowNull: false },
    metodopago_id: { type: DataTypes.INTEGER, allowNull: false },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  }, {
    timestamps: false,
    tableName: 'CuentasConciliables',
    indexes: [{ unique: true, fields: ['usuario_id', 'metodopago_id'], name: 'uniq_cuenta_conciliable' }]
  });
  return CuentasConciliables;
};
