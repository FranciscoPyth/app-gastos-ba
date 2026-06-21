module.exports = (sequelize, DataTypes) => {
  const SaldosIniciales = sequelize.define('SaldosIniciales', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    usuario_id: { type: DataTypes.INTEGER, allowNull: false },
    metodopago_id: { type: DataTypes.INTEGER, allowNull: false },
    divisa_id: { type: DataTypes.INTEGER, allowNull: false },
    saldo_inicial: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    fecha: { type: DataTypes.DATEONLY, allowNull: false }
  }, {
    timestamps: false,
    tableName: 'SaldosIniciales',
    indexes: [{ unique: true, fields: ['metodopago_id', 'divisa_id'], name: 'uniq_saldo_inicial_par' }]
  });
  return SaldosIniciales;
};
