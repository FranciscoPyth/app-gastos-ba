module.exports = (sequelize, DataTypes) => {
    const TarjetasCredito = sequelize.define('TarjetasCredito', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        nombre: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        ultimos_4: {
            type: DataTypes.STRING(4),
            allowNull: true
        },
        divisa_resumen: {
            type: DataTypes.STRING(10),
            defaultValue: 'ARS'
        },
        // Día del mes en que cierra (1-31)
        dia_cierre: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        // Día del mes en que vence el pago del resumen (1-31)
        dia_vencimiento: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        limite: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true
        },
        // Color para badge en UI
        color: {
            type: DataTypes.STRING(20),
            allowNull: true,
            defaultValue: '#64D888'
        },
        // activa | cerrada
        estado: {
            type: DataTypes.STRING(20),
            defaultValue: 'activa'
        }
    }, {
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        tableName: 'TarjetasCredito'
    });

    return TarjetasCredito;
};
