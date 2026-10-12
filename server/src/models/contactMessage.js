'use strict';

module.exports = (sequelize, DataTypes) => {
  const ContactMessage = sequelize.define(
    'ContactMessage',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(160), allowNull: false, validate: { notEmpty: true } },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: { isEmail: true },
        set(value) {
          this.setDataValue('email', String(value || '').trim().toLowerCase());
        },
      },
      phone: { type: DataTypes.STRING(40), allowNull: true },
      message: { type: DataTypes.TEXT, allowNull: false, validate: { notEmpty: true } },
    },
    { tableName: 'contact_messages', underscored: true }
  );

  ContactMessage.prototype.toPublicJSON = function toPublicJSON() {
    return {
      id: String(this.id),
      name: this.name,
      email: this.email,
      phone: this.phone,
      message: this.message,
      createdAt: this.createdAt,
    };
  };

  return ContactMessage;
};
