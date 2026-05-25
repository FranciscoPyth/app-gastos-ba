module.exports = (sequelize, DataTypes) => {
    const Suscripciones = sequelize.define('Suscripciones', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        descripcion: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        monto: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
        },
        divisa: {
            type: DataTypes.STRING(10),
            allowNull: false
        },
        // Día del mes en que se cobra (1-31)
        dia_cobro: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        // Si se cobra con tarjeta de crédito, vinculá. Nullable para débito/efectivo.
        tarjeta_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'TarjetasCredito', key: 'id' }
        },
        metodo_pago: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        categoria: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        fecha_inicio: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        // Si null, la suscripción es indefinida
        fecha_fin: {
            type: DataTypes.DATEONLY,
            allowNull: true
        },
        // activa | pausada | cancelada
        estado: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'activa'
        },
        created_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            allowNull: false
        }
    }, {
        timestamps: false,
        tableName: 'Suscripciones'
    });

    return Suscripciones;
};
