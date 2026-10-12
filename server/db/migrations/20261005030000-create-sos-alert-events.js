'use strict';

/**
 * Everything that has happened to an SOS alert.
 *
 * `sos_alerts` only remembers the latest of each thing: one acknowledgement,
 * one assignee, one resolution. Hand an alert from one person to another and
 * the first name is overwritten; an escalation leaves no trace on the alert
 * at all. After an incident the question is "what happened, in what order,
 * and who did it", and the alert row cannot answer that.
 *
 * Append-only, one row per event, the same shape as `task_events`.
 *
 * Existing alerts are given a history from the columns they already have, so
 * the log does not start empty or claim that an alert resolved last week was
 * never raised. Two things cannot be reconstructed and are simply absent for
 * old alerts: earlier assignees that were overwritten, and escalations.
 */

const TYPES = [
  'raised',
  'acknowledged',
  'assigned',
  'unassigned',
  'escalated',
  'resolved',
  'cancelled',
];

/**
 * A raw SELECT hands dates back differently per driver: MySQL gives a Date,
 * SQLite gives text like `2026-10-05 09:12:47.000 +00:00`. Sequelize stores
 * both in UTC, so text with no offset is read as UTC rather than local time.
 */
function toDate(value) {
  if (value instanceof Date) return value;
  const text = String(value).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s*(Z|[+-]\d{2}:?\d{2})?$/);
  if (!match) return new Date(text);
  return new Date(`${match[1]}T${match[2]}${match[3] || 'Z'}`);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'sos_alert_events',
      {
        id: {
          type: Sequelize.BIGINT.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        alert_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: 'sos_alerts', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        type: { type: Sequelize.ENUM(...TYPES), allowNull: false },
        // Who did it: the traveller the alert belongs to, a member of staff,
        // or the platform itself (escalation). Stored rather than inferred
        // from a null actor, so "the system did this" and "the member of
        // staff who did this has since been deleted" stay different facts.
        actor_kind: {
          type: Sequelize.ENUM('traveller', 'staff', 'system'),
          allowNull: false,
        },
        actor_user_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        detail: { type: Sequelize.STRING(1000), allowNull: true },

        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_general_ci', engine: 'InnoDB' }
    );

    await queryInterface.addIndex('sos_alert_events', ['alert_id', 'created_at'], {
      name: 'idx_sos_alert_events_alert_time',
    });
    await queryInterface.addIndex('sos_alert_events', ['created_at'], {
      name: 'idx_sos_alert_events_created_at',
    });

    // --- Backfill -----------------------------------------------------------

    const [alerts] = await queryInterface.sequelize.query(
      `SELECT a.id, a.raised_at, a.latitude, a.message,
              a.acknowledged_at, a.acknowledged_by_user_id,
              a.assigned_at, a.assigned_by_user_id,
              u.first_name AS assignee_first_name, u.last_name AS assignee_last_name,
              a.resolved_at, a.resolved_by_user_id, a.resolution_notes,
              a.cancelled_at
         FROM sos_alerts a
         LEFT JOIN users u ON u.id = a.assigned_to_user_id`
    );

    const rows = [];
    const add = (alert, type, at, actorKind, actorUserId, detail) => {
      if (!at) return;
      const when = toDate(at);
      rows.push({
        alert_id: alert.id,
        type,
        actor_kind: actorKind,
        actor_user_id: actorUserId || null,
        detail: detail ? String(detail).slice(0, 1000) : null,
        created_at: when,
        updated_at: when,
      });
    };

    for (const alert of alerts) {
      const position = alert.latitude === null ? 'No position sent.' : 'Position sent.';
      add(
        alert,
        'raised',
        alert.raised_at,
        'traveller',
        null,
        alert.message ? `${position} Note: "${alert.message}"` : position
      );
      add(alert, 'acknowledged', alert.acknowledged_at, 'staff', alert.acknowledged_by_user_id, null);
      add(
        alert,
        'assigned',
        alert.assigned_at,
        'staff',
        alert.assigned_by_user_id,
        alert.assignee_first_name
          ? `To ${alert.assignee_first_name} ${alert.assignee_last_name}`
          : null
      );
      add(
        alert,
        'resolved',
        alert.resolved_at,
        'staff',
        alert.resolved_by_user_id,
        alert.resolution_notes
      );
      add(alert, 'cancelled', alert.cancelled_at, 'traveller', null, null);
    }

    if (rows.length > 0) {
      rows.sort((a, b) => a.created_at - b.created_at);
      await queryInterface.bulkInsert('sos_alert_events', rows);
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sos_alert_events');
  },
};
