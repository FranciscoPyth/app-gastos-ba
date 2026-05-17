module.exports = (sequelize, DataTypes) => {
    const Deudas = sequelize.define('Deudas', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        nombre_acreedor: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        // Monto inicial de la deuda. Nunca cambia después de creada.
        monto_original: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false
        },
        // Saldo pendiente. Decrece con cada pago/abono.
        saldo_restante: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0
        },
        divisa: {
            type: DataTypes.STRING(10),
            defaultValue: 'ARS'
        },
        tasa_interes: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: true
        },
        pago_mensual: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true
        },
        cantidad_cuotas: {
            type: DataTypes.INTEGER,
            defaultValue: 1
        },
        fecha_inicio: {
            type: DataTypes.DATEONLY,
            allowNull: true
        },
        fecha_fin: {
            type: DataTypes.DATEONLY,
            allowNull: true
        },
        descripcion: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        origen: {
            type: DataTypes.STRING(50),
            allowNull: true
        },
        // activa | parcial | cerrada | en_mora
        estado: {
            type: DataTypes.STRING(20),
            defaultValue: 'activa'
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        }
    }, {
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false,
        tableName: 'Deudas'
    });

    return Deudas;
};
