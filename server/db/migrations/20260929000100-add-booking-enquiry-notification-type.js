'use strict';

/**
 * One more notification type: `booking_enquiry_received`, raised when someone
 * submits a booking enquiry through the public TrailAsia Book site (no
 * staff account, no auth — see `bookingService.createPublicEnquiry`). It
 * lands with whichever consultant was assigned to intake, so the bell is how
 * they find out a new lead exists at all.
 *
 * Same shape as `20260928000100-add-payment-reminder-notification-types.js`:
 * `down` fails loudly rather than discarding rows if the type has actually
 * been raised.
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
  'payment_due_soon',
  'payment_overdue',
];

const EXTENDED = [...ORIGINAL, 'booking_enquiry_received'];

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
