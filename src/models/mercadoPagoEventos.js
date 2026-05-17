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
            { fields: ['user_id', 'procesado'], name: 'idx_mp_eventos_user_procesado' }
        ]
    });

    return MercadoPagoEventos;
};
