module.exports = (sequelize, DataTypes) => {
    const AgendaCategorias = sequelize.define('AgendaCategorias', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: DataTypes.INTEGER, allowNull: false },
        nombre: { type: DataTypes.STRING(60), allowNull: false },
        orden: { type: DataTypes.INTEGER, allowNull: true },
        activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    }, { tableName: 'AgendaCategorias', timestamps: false });
    return AgendaCategorias;
};
