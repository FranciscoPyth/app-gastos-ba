module.exports = (sequelize, DataTypes) => {
    const PresupuestoLineas = sequelize.define('PresupuestoLineas', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: DataTypes.INTEGER, allowNull: false },
        periodo: { type: DataTypes.STRING(7), allowNull: false },
        rol: { type: DataTypes.ENUM('ingreso', 'asignacion'), allowNull: false },
        nombre: { type: DataTypes.STRING(100), allowNull: false },
        monto: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
        moneda: { type: DataTypes.ENUM('USD', 'ARS', 'EUR'), allowNull: false, defaultValue: 'ARS' },
        orden: { type: DataTypes.INTEGER, allowNull: true },
        activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    }, { tableName: 'PresupuestoLineas', timestamps: false });
    return PresupuestoLineas;
};
