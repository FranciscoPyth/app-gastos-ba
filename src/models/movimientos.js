module.exports = (sequelize, DataTypes) => {
    const Movimientos = sequelize.define('Movimientos', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        // Tipo de entidad a la que pertenece el movimiento
        entidad_tipo: {
            type: DataTypes.ENUM('prestamo', 'deuda', 'objetivo'),
            allowNull: false
        },
        entidad_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        // tipo de movimiento:
        //   - toma_deuda          : el user contrajo una deuda (entra plata)
        //   - abono               : el user pagó cuota de una deuda (sale plata)
        //   - otorgamiento_prestamo: el user prestó plata a alguien (sale plata)
        //   - cobro               : a el user le devolvieron parte de un préstamo (entra plata)
        //   - aporte              : el user puso plata en un objetivo (sale plata del disponible)
        //   - retiro              : el user sacó plata de un objetivo (vuelve al disponible)
        tipo: {
            type: DataTypes.ENUM(
                'abono', 'cobro', 'aporte', 'retiro',
                'toma_deuda', 'otorgamiento_prestamo'
            ),
            allowNull: false
        },
        monto: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false
        },
        divisa: {
            type: DataTypes.STRING(10),
            defaultValue: 'ARS'
        },
        fecha: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        // Referencia opcional al registro de gasto espejo
        gasto_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        gasto_source: {
            type: DataTypes.ENUM('gastos', 'GastosPruebaN8N'),
            allowNull: true
        },
        descripcion: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false,
        tableName: 'Movimientos',
        indexes: [
            { fields: ['entidad_tipo', 'entidad_id'], name: 'idx_movimientos_entidad' },
            { fields: ['user_id', 'fecha'], name: 'idx_movimientos_user_fecha' }
        ]
    });

    return Movimientos;
};
