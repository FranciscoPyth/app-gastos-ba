module.exports = (sequelize, DataTypes) => {
    const ObjetivosSemanales = sequelize.define('ObjetivosSemanales', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: DataTypes.INTEGER, allowNull: false },
        semana: { type: DataTypes.DATEONLY, allowNull: false },
        texto: { type: DataTypes.STRING(300), allowNull: false },
        categoria: { type: DataTypes.STRING(60), allowNull: true },
        meta: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
        progreso: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        completado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        created_at: { type: DataTypes.DATE, allowNull: false },
    }, { tableName: 'ObjetivosSemanales', timestamps: false });
    return ObjetivosSemanales;
};
