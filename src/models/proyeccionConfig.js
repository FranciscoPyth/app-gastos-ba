module.exports = (sequelize, DataTypes) => {
    const ProyeccionConfig = sequelize.define('ProyeccionConfig', {
        user_id: { type: DataTypes.INTEGER, primaryKey: true },
        aporte_mensual_usd: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
        horizonte_meses: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 12 },
        rendimiento_anual_pct: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 0 },
        meta_usd: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
        updated_at: { type: DataTypes.DATE, allowNull: false },
    }, { tableName: 'ProyeccionConfig', timestamps: false });
    return ProyeccionConfig;
};
