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
        monto_prestamo: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
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
            type: DataTypes.DECIMAL(10, 2),
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
        estado: {
            type: DataTypes.STRING(20),
            defaultValue: 'activo'
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
