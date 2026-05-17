module.exports = (sequelize, DataTypes) => {
    const Prestamos = sequelize.define('Prestamos', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        nombre_persona: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        // Monto inicial prestado. No cambia después de creado.
        monto_original: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false
        },
        // Saldo que la persona aún te debe. Decrece con cada cobro.
        saldo_restante: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0
        },
        divisa: {
            type: DataTypes.STRING(10),
            defaultValue: 'ARS'
        },
        fecha_prestamo: {
            type: DataTypes.DATEONLY,
            allowNull: true
        },
        fecha_vencimiento: {
            type: DataTypes.DATEONLY,
            allowNull: true
        },
        descripcion: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        // pendiente | parcial | pagado
        estado: {
            type: DataTypes.STRING(20),
            defaultValue: 'pendiente'
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        }
    }, {
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false,
        tableName: 'Prestamos'
    });

    return Prestamos;
};
