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
      // Which kind of session this is. Staff, travellers and operators share
      // this table so that rotation and reuse detection have exactly one
      // implementation.
      subjectType: {
        type: DataTypes.ENUM('staff', 'traveller', 'operator'),
        allowNull: false,
        defaultValue: 'staff',
      },
      userId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
      },
      travellerId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
      },
      operatorId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
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
      hooks: {
        /**
         * The database cannot express "exactly one of these three" portably,
         * so it is enforced here: a row with none belongs to nobody, and a row
         * with more than one belongs to more than one person.
         *
         * A creation hook rather than a model validator on purpose. Model
         * validators also run against the partial instance Sequelize builds for
         * a bulk update, where none of the subject columns are present — which
         * would make every `revoke` call fail on a row that is perfectly valid.
         */
        beforeCreate(token) {
          const hasUser = token.userId !== null && token.userId !== undefined;
          const hasTraveller = token.travellerId !== null && token.travellerId !== undefined;
          const hasOperator = token.operatorId !== null && token.operatorId !== undefined;
          const subjectCount = [hasUser, hasTraveller, hasOperator].filter(Boolean).length;
          if (subjectCount !== 1) {
            throw new Error(
              'A refresh token must belong to exactly one staff user, traveller or operator.'
            );
          }
          if (token.subjectType === 'staff' && !hasUser) {
            throw new Error('A staff refresh token needs a user_id.');
          }
          if (token.subjectType === 'traveller' && !hasTraveller) {
            throw new Error('A traveller refresh token needs a traveller_id.');
          }
          if (token.subjectType === 'operator' && !hasOperator) {
            throw new Error('An operator refresh token needs an operator_id.');
          }
        },
      },
    }
  );

  RefreshToken.associate = (models) => {
    RefreshToken.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
    });
    RefreshToken.belongsTo(models.Traveller, {
      foreignKey: 'travellerId',
      as: 'traveller',
      onDelete: 'CASCADE',
    });
    RefreshToken.belongsTo(models.Operator, {
      foreignKey: 'operatorId',
      as: 'operator',
      onDelete: 'CASCADE',
    });
  };

  RefreshToken.prototype.isActive = function isActive() {
    return !this.revokedAt && this.expiresAt.getTime() > Date.now();
  };

  return RefreshToken;
};
