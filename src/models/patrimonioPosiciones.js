module.exports = (sequelize, DataTypes) => {
    const PatrimonioPosiciones = sequelize.define('PatrimonioPosiciones', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: DataTypes.INTEGER, allowNull: false },
        billetera: { type: DataTypes.STRING(100), allowNull: false },
        moneda: { type: DataTypes.ENUM('USD', 'ARS', 'EUR'), allowNull: false },
        tipo: { type: DataTypes.ENUM('ahorro', 'inversion'), allowNull: false },
        saldo: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
        orden: { type: DataTypes.INTEGER, allowNull: true },
        activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    }, { tableName: 'PatrimonioPosiciones', timestamps: false });
    return PatrimonioPosiciones;
};
