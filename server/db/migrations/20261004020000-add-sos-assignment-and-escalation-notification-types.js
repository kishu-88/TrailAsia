'use strict';

/**
 * Two more notification types for the SOS assignment/escalation feature:
 *
 *  - `sos_assigned` — somebody handed an open alert to a specific person
 *    (not necessarily themselves; see the companion `add-sos-alert-assignment`
 *    migration).
 *  - `sos_escalated` — an alert has sat `raised`, with nobody assigned to it,
 *    past `SOS_ESCALATION_MINUTES`. Raised by the scheduled sweep
 *    (`jobs/sosEscalation.js`), not computed on read, for the same reason
 *    `task_overdue` and the payment reminders are sweep-raised: a
 *    notification that only exists while somebody is looking at the page has
 *    not notified anybody.
 *
 * Same additive-ENUM shape as every other notification-type migration.
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
  'contact_message_received',
  'operator_declined',
  'operator_confirmation_requested',
];

const EXTENDED = [...ORIGINAL, 'sos_assigned', 'sos_escalated'];

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
