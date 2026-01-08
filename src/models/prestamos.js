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
        monto: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
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
