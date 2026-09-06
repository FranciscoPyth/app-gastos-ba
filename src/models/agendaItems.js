module.exports = (sequelize, DataTypes) => {
    const AgendaItems = sequelize.define('AgendaItems', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: DataTypes.INTEGER, allowNull: false },
        texto: { type: DataTypes.STRING(500), allowNull: false },
        categoria: { type: DataTypes.STRING(60), allowNull: true },
        fecha: { type: DataTypes.DATEONLY, allowNull: true },
        hora: { type: DataTypes.TIME, allowNull: true },
        estado: { type: DataTypes.ENUM('pendiente', 'hecho'), allowNull: false, defaultValue: 'pendiente' },
        recordado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        created_at: { type: DataTypes.DATE, allowNull: false },
    }, { tableName: 'AgendaItems', timestamps: false });
    return AgendaItems;
};
