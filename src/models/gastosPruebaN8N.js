module.exports = (sequelize, DataTypes) => {
  const GastosPruebaN8N = sequelize.define('GastosPruebaN8N', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    descripcion: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    monto: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    fecha: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    divisa: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    tipos_transaccion: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    metodo_pago: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    categoria: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    numero_cel: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false
    }
  }, { 
    timestamps: false,
    tableName: 'GastosPruebaN8N'
  });

  return GastosPruebaN8N;
};