module.exports = (sequelize, DataTypes) => {
  const Conciliaciones = sequelize.define('Conciliaciones', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    usuario_id: { type: DataTypes.INTEGER, allowNull: false },
    metodopago_id: { type: DataTypes.INTEGER, allowNull: false },
    divisa_id: { type: DataTypes.INTEGER, allowNull: false },
    periodo: { type: DataTypes.DATEONLY, allowNull: false },
    saldo_base: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    saldo_teorico: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    saldo_real: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    diferencia: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    estado: { type: DataTypes.ENUM('conciliada', 'pendiente'), allowNull: false }
  }, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    tableName: 'Conciliaciones',
    indexes: [
      { unique: true, fields: ['metodopago_id', 'divisa_id', 'periodo'], name: 'uniq_conciliacion_par_periodo' },
      { fields: ['usuario_id', 'periodo'], name: 'idx_conciliacion_user_periodo' }
    ]
  });
  return Conciliaciones;
};
