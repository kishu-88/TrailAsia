'use strict';

/**
 * One more notification type: `contact_message_received`, raised when
 * someone submits the public site's general contact form (see
 * `contactMessage.service.js`) — as opposed to `booking_enquiry_received`,
 * which is a trip enquiry. Same shape as the other additive ENUM
 * migrations: `down` fails loudly rather than discarding rows if the type
 * has actually been raised.
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
  'booking_enquiry_received',
  'document_submitted',
];

const EXTENDED = [...ORIGINAL, 'contact_message_received'];

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
