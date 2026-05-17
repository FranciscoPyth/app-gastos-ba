// Cuenta de Mercado Pago vinculada por usuario.
// Los tokens se guardan cifrados con utils/crypto (AES-256-GCM).
module.exports = (sequelize, DataTypes) => {
    const MercadoPagoCuentas = sequelize.define('MercadoPagoCuentas', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true
        },
        // ID del usuario en MP (lo devuelve OAuth)
        mp_user_id: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        // Tokens cifrados (formato iv:tag:ciphertext)
        access_token: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        refresh_token: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        expires_at: {
            type: DataTypes.DATE,
            allowNull: false
        },
        scope: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        // Fecha del último sync exitoso (para filtrar nuevos pagos)
        last_sync_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        // activa | expirada | revocada
        estado: {
            type: DataTypes.STRING(20),
            defaultValue: 'activa'
        }
    }, {
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        tableName: 'MercadoPagoCuentas'
    });

    return MercadoPagoCuentas;
};
