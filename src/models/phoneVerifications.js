module.exports = (sequelize, DataTypes) => {
    const PhoneVerifications = sequelize.define('PhoneVerifications', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        usuario_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        telefono: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        codigo: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        expires_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    }, {
        tableName: 'PhoneVerifications',
        timestamps: true,
        updatedAt: false,
    });

    return PhoneVerifications;
};
