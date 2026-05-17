module.exports = (sequelize, DataTypes) => {
  const ChatMessages = sequelize.define('ChatMessages', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    wa_id: {
      type: DataTypes.STRING(30),
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('user', 'assistant'),
      allowNull: false
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false
    }
  }, {
    timestamps: false,
    tableName: 'ChatMessages',
    indexes: [
      { fields: ['wa_id', 'created_at'] }
    ]
  });

  return ChatMessages;
};
