'use strict';

/**
 * Two more notification types, for the instalment-chasing sweep.
 *
 * `payment_due_soon` is the nudge before the date; `payment_overdue` is the one
 * after it, repeated only when the instalment is rescheduled and misses its new
 * date too — see `payment.service.js`.
 *
 * Same shape as `20260923000500-add-payment-notification-types.js`: `down`
 * fails loudly rather than discarding rows if either type has actually been
 * raised.
 */

const ORIGINAL = [
  'sos_raised',
  'sos_acknowledged',
  'sos_resolved',
  'task_assigned',
  'task_handover',
  'task_overdue',
  'document_verified',
  'document_rejected',
  'portal_activated',
  'booking_cancelled',
  'payment_received',
  'payment_failed',
];

const EXTENDED = [...ORIGINAL, 'payment_due_soon', 'payment_overdue'];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('notifications', 'type', {
      type: Sequelize.ENUM(...EXTENDED),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('notifications', 'type', {
      type: Sequelize.ENUM(...ORIGINAL),
      allowNull: false,
    });
  },
};
