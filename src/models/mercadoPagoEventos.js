// Eventos crudos recibidos de Mercado Pago (webhook o polling).
// Usado para idempotencia: si llega el mismo payment_id dos veces, no se duplica.
module.exports = (sequelize, DataTypes) => {
    const MercadoPagoEventos = sequelize.define('MercadoPagoEventos', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: true   // los webhooks no siempre identifican usuario al llegar
        },
        // ID único del payment/movement en MP (clave para idempotencia)
        mp_resource_id: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true
        },
        // payment | merchant_order | movement
        mp_resource_type: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        // 'webhook' | 'polling' | 'manual'
        origen: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'polling'
        },
        raw_payload: {
            type: DataTypes.JSON,
            allowNull: true
        },
        procesado: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        // pendiente_descripcion | procesado | ignorado
        // Default 'procesado' para no romper filas históricas (ya tenían gasto creado).
        estado: {
            type: DataTypes.STRING(30),
            allowNull: false,
            defaultValue: 'procesado'
        },
        // Datos del movimiento, cacheados para mostrar el pendiente sin releer raw_payload.
        monto: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: true
        },
        divisa: {
            type: DataTypes.STRING(10),
            allowNull: true
        },
        // Ingreso | Gasto
        tipo: {
            type: DataTypes.STRING(20),
            allowNull: true
        },
        // Descripción autogenerada por MP (hint del comercio), si la hay.
        comercio: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        // ID del gasto creado en GastosPruebaN8N (espejo)
        gasto_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        error: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false,
        tableName: 'MercadoPagoEventos',
        indexes: [
            { fields: ['user_id', 'procesado'], name: 'idx_mp_eventos_user_procesado' },
            { fields: ['user_id', 'estado'], name: 'idx_mp_eventos_user_estado' }
        ]
    });

    return MercadoPagoEventos;
};
