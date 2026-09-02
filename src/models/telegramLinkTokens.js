module.exports = (sequelize, DataTypes) => {
    const TelegramLinkTokens = sequelize.define('TelegramLinkTokens', {
        token: {
            type: DataTypes.STRING(64),
            primaryKey: true,
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        expires_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    }, {
        tableName: 'TelegramLinkTokens',
        timestamps: false,
    });

    return TelegramLinkTokens;
};
