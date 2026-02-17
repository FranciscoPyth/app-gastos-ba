// src/models/usuarios.js

module.exports = (sequelize, DataTypes) => {
  const Usuarios = sequelize.define('Usuarios', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    telefono: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: false,
    },
  }, {
    timestamps: false, // Deshabilita la gestión automática de timestamps
    indexes: [
      {
        unique: true,
        fields: ['username'],
        name: 'unique_username_constraint'
      },
      {
        unique: true,
        fields: ['email'],
        name: 'unique_email_constraint'
      }
    ]
  });
  return Usuarios;
};
