module.exports = (sequelize, DataTypes) => {
    const GoogleCalendarCuentas = sequelize.define('GoogleCalendarCuentas', {
        user_id: { type: DataTypes.INTEGER, primaryKey: true },
        refresh_token: { type: DataTypes.TEXT, allowNull: false },
        access_token: { type: DataTypes.TEXT, allowNull: true },
        token_expiry: { type: DataTypes.DATE, allowNull: true },
        google_email: { type: DataTypes.STRING(255), allowNull: true },
        scope: { type: DataTypes.STRING(255), allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false },
    }, { tableName: 'GoogleCalendarCuentas', timestamps: false });
    return GoogleCalendarCuentas;
};
