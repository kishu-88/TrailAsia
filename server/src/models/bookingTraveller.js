'use strict';

module.exports = (sequelize, DataTypes) => {
  const BookingTraveller = sequelize.define(
    'BookingTraveller',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      bookingId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      travellerId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      isLead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      notes: { type: DataTypes.STRING(500), allowNull: true },
    },
    { tableName: 'booking_travellers', underscored: true }
  );

  return BookingTraveller;
};
