module.exports = (sequelize, DataTypes) => {
  const Categorias = sequelize.define('Categorias', {
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
  return Categorias;
};
