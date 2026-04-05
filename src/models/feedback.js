module.exports = (sequelize, DataTypes) => {
    const Feedback = sequelize.define('Feedback', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        rating: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        comment: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        source: {
            type: DataTypes.ENUM('popup', 'settings'),
            allowNull: false,
            defaultValue: 'popup'
        },
        created_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        }
    }, {
        tableName: 'feedback',
        timestamps: false
    });

    return Feedback;
};
