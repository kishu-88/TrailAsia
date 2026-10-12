'use strict';

/**
 * Two more notification types, for the payments module.
 *
 * `payment_received` tells the consultant who sold the trip that the money has
 * landed, which today they find out by asking. `payment_failed` is the one that
 * matters: a transfer that bounces after a booking has been confirmed is the
 * agency's exposure, and it currently surfaces at month end.
 *
 * Extending an ENUM means rewriting the column. On MySQL that is a single
 * ALTER TABLE; the values are only ever added to, never removed or reordered,
 * so existing rows keep their meaning.
 *
 * `down` puts the original list back. It will fail if any payment notification
 * has actually been raised — correctly so, because there is no honest way to
 * reverse this migration without losing those rows, and failing loudly beats
 * discarding them.
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
];

const EXTENDED = [...ORIGINAL, 'payment_received', 'payment_failed'];

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
