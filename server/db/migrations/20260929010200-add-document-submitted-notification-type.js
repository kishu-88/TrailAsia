'use strict';

/**
 * One more notification type: `document_submitted`, raised when a traveller
 * adds a document from their own portal (see `travellerPortal.service.js
 * #addOwnDocument`). Same shape as `20260929000100-add-booking-enquiry-...`:
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
  'booking_enquiry_received',
];

const EXTENDED = [...ORIGINAL, 'document_submitted'];

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
