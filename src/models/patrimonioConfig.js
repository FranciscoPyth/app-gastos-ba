module.exports = (sequelize, DataTypes) => {
    const PatrimonioConfig = sequelize.define('PatrimonioConfig', {
        user_id: { type: DataTypes.INTEGER, primaryKey: true },
        usd_ars: { type: DataTypes.DECIMAL(18, 4), allowNull: false, defaultValue: 1000 },
        eur_usd: { type: DataTypes.DECIMAL(18, 4), allowNull: false, defaultValue: 1.08 },
        updated_at: { type: DataTypes.DATE, allowNull: false },
    }, { tableName: 'PatrimonioConfig', timestamps: false });
    return PatrimonioConfig;
};
