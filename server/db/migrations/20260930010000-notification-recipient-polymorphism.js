'use strict';

/**
 * Notifications become recipient-polymorphic.
 *
 * Until now every notification went to a staff `User` — `user_id` was
 * `allowNull: false` and that was the whole audience model. Three things
 * need to notify someone who is not staff: a traveller finding out their
 * document was verified/rejected, and (new, with the operator portal) an
 * operator finding out staff need something from them. Rather than a
 * separate table per audience — which would mean three unread-count
 * queries, three read models, three places the "don't tell the actor what
 * they just did" rule has to be re-implemented — this adds the other two
 * possible recipients as nullable FKs alongside `user_id`, which itself
 * becomes nullable. Exactly one of the three must be set; enforced in the
 * model (see `models/notification.js`), the same way `RefreshToken`
 * enforces "exactly one of user/traveller" already — a portable CHECK
 * constraint isn't available across MySQL and the SQLite tests use.
 *
 * Also folds in a real bug found while wiring this up: `operator.service.js`
 * has raised an `operator_declined` notification since the operators phase,
 * but that type was never added to this ENUM — every one of those calls has
 * been silently swallowed by `notify()`'s try/catch since the day it
 * shipped. Fixed here rather than filed separately, since this migration is
 * already touching the `type` column for `operator_confirmation_requested`.
 */

const ORIGINAL_TYPES = [
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
];

const EXTENDED_TYPES = [...ORIGINAL_TYPES, 'operator_declined', 'operator_confirmation_requested'];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('notifications', 'user_id', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
    });
    await queryInterface.addColumn('notifications', 'traveller_id', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
    });
    await queryInterface.addColumn('notifications', 'operator_id', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
    });
    await queryInterface.changeColumn('notifications', 'type', {
      type: Sequelize.ENUM(...EXTENDED_TYPES),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('notifications', 'operator_id');
    await queryInterface.removeColumn('notifications', 'traveller_id');
    await queryInterface.changeColumn('notifications', 'type', {
      type: Sequelize.ENUM(...ORIGINAL_TYPES),
      allowNull: false,
    });
    await queryInterface.changeColumn('notifications', 'user_id', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: false,
    });
  },
};
