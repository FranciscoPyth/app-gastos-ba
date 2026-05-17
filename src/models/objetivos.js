module.exports = (sequelize, DataTypes) => {
    const Objetivos = sequelize.define('Objetivos', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        nombre: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        monto_objetivo: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false
        },
        monto_actual: {
            type: DataTypes.DECIMAL(12, 2),
            defaultValue: 0
        },
        divisa: {
            type: DataTypes.STRING(10),
            defaultValue: 'ARS'
        },
        fecha_limite: {
            type: DataTypes.DATEONLY,
            allowNull: true
        },
        descripcion: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        // activa | completada
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
        tableName: 'Objetivos'
    });

    return Objetivos;
};
