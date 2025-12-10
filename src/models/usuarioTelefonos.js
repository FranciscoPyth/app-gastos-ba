module.exports = (sequelize, DataTypes) => {
    const UsuarioTelefonos = sequelize.define('UsuarioTelefonos', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        usuario_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'Usuarios',
                key: 'id',
            },
        },
        telefono: {
            type: DataTypes.STRING,
            allowNull: false,
        },
    }, {
        tableName: 'UsuarioTelefonos',
        timestamps: false,
    });

    return UsuarioTelefonos;
};
