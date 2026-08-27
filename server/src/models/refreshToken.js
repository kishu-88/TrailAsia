'use strict';

/**
 * Refresh token record.
 *
 * The token itself is a random opaque string that only ever exists in the
 * client's httpOnly cookie. What is stored here is its SHA-256 hash, so a
 * dump of this table does not hand an attacker working sessions.
 *
 * Tokens rotate on every refresh: the old row is revoked and linked to its
 * replacement, which makes reuse of a stolen token detectable.
 */
module.exports = (sequelize, DataTypes) => {
  const RefreshToken = sequelize.define(
    'RefreshToken',
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      tokenHash: {
        type: DataTypes.CHAR(64),
        allowNull: false,
        unique: true,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      replacedByHash: {
        type: DataTypes.CHAR(64),
        allowNull: true,
      },
      userAgent: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      ipAddress: {
        type: DataTypes.STRING(45), // long enough for IPv6
        allowNull: true,
      },
    },
    {
      tableName: 'refresh_tokens',
      underscored: true,
    }
  );

  RefreshToken.associate = (models) => {
    RefreshToken.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
    });
  };

  RefreshToken.prototype.isActive = function isActive() {
    return !this.revokedAt && this.expiresAt.getTime() > Date.now();
  };

  return RefreshToken;
};
