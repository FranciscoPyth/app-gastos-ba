// Registro de recordatorios de re-enganche enviados por WhatsApp (panel admin).
// Sirve para medir reactivación: si el usuario interactúa con el asistente DESPUÉS
// de enviado_at, se considera que "volvió".
module.exports = (sequelize, DataTypes) => {
    const RecordatoriosReenganche = sequelize.define('RecordatoriosReenganche', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        enviado_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        template: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        // enviado | error
        estado: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'enviado'
        },
        error: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        wa_message_id: {
            type: DataTypes.STRING(120),
            allowNull: true
        }
    }, {
        timestamps: false,
        tableName: 'RecordatoriosReenganche',
        indexes: [
            { fields: ['user_id', 'enviado_at'], name: 'idx_reenganche_user_fecha' }
        ]
    });

    return RecordatoriosReenganche;
};
