module.exports = (sequelize, DataTypes) => {
    const PatrimonioSnapshots = sequelize.define('PatrimonioSnapshots', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: DataTypes.INTEGER, allowNull: false },
        periodo: { type: DataTypes.STRING(7), allowNull: false },
        fecha: { type: DataTypes.DATE, allowNull: false },
        total_usd: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
        ahorros_usd: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
        inversiones_usd: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
        usd_ars: { type: DataTypes.DECIMAL(18, 4), allowNull: false },
        eur_usd: { type: DataTypes.DECIMAL(18, 4), allowNull: false },
        detalle: { type: DataTypes.JSON, allowNull: true },
    }, { tableName: 'PatrimonioSnapshots', timestamps: false });
    return PatrimonioSnapshots;
};
