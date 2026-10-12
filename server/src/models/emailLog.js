'use strict';

module.exports = (sequelize, DataTypes) => {
  const EmailLog = sequelize.define(
    'EmailLog',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      toAddress: { type: DataTypes.STRING(255), allowNull: false },
      subject: { type: DataTypes.STRING(255), allowNull: false },
      context: { type: DataTypes.STRING(120), allowNull: true },
      status: {
        type: DataTypes.ENUM('sent', 'failed', 'skipped'),
        allowNull: false,
      },
      error: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: 'email_logs', underscored: true }
  );

  EmailLog.prototype.toPublicJSON = function toPublicJSON() {
    return {
      id: String(this.id),
      to: this.toAddress,
      subject: this.subject,
      context: this.context,
      status: this.status,
      error: this.error,
      createdAt: this.createdAt,
    };
  };

  return EmailLog;
};
