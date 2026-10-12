import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Badge from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import Card from '../components/common/Card.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import ErrorNotice from '../components/common/ErrorNotice.jsx';
import Modal from '../components/common/Modal.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import Spinner from '../components/common/Spinner.jsx';
import { SelectField } from '../components/common/Field.jsx';
import AlertHistory from '../features/safety/AlertHistory.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  acknowledgeAlert,
  assignAlert,
  listAlerts,
  resolveAlert,
} from '../services/safety.service.js';
import { listUsers } from '../services/users.service.js';
import { formatDateTime } from '../utils/format.js';

/**
 * The safety desk.
 *
 * Open alerts first, oldest at the top, and it refreshes itself every thirty
 * seconds. Polling rather than a websocket: the agency is 25 people, the event
 * rate is measured in alerts per month, and a connection that silently drops
 * would be a worse failure than a poll that is thirty seconds late.
 *
 * There is no notification sound or desktop alert here yet, and that is the
 * honest gap — this screen only helps somebody who is looking at it. Paging an
 * on-call phone is the piece that makes the after-hours promise real, and it
 * needs a messaging provider the agency has not chosen.
 */
const POLL_INTERVAL_MS = 30000;

const STATUS_TONE = {
  raised: 'danger',
  acknowledged: 'warning',
  resolved: 'success',
  cancelled: 'neutral',
};

function coordinates(alert) {
  if (alert.latitude === null || alert.longitude === null) return null;
  return `${alert.latitude.toFixed(5)}, ${alert.longitude.toFixed(5)}`;
}

export default function SafetyPage() {
  const { user } = useAuth();
  const toast = useToast();

  const [filter, setFilter] = useState('open');
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resolving, setResolving] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [assigningId, setAssigningId] = useState(null);

  const canAct = ['consultant', 'coordinator', 'admin'].includes(user.role);

  useEffect(() => {
    if (!canAct) return;
    // Only the roles that can act on an alert are offered as assignees —
    // handing one to finance would just bounce off the server's own check.
    listUsers({ isActive: 'true', perPage: 100 })
      .then((response) =>
        setAssignableUsers(
          (response.data || []).filter((row) =>
            ['consultant', 'coordinator', 'admin'].includes(row.role)
          )
        )
      )
      .catch(() => setAssignableUsers([]));
  }, [canAct]);

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (!quiet) setLoading(true);
      try {
        setAlerts(await listAlerts({ status: filter === 'all' ? '' : filter }));
        setError(null);
      } catch (caught) {
        setError(caught);
      } finally {
        setLoading(false);
      }
    },
    [filter]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Quiet reloads, so a poll landing mid-read does not blank the screen.
    const timer = setInterval(() => load({ quiet: true }), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function handleAssign(alert, userId) {
    setAssigningId(alert.id);
    try {
      await assignAlert(alert.id, userId || null);
      const assignee = assignableUsers.find((row) => String(row.id) === String(userId));
      toast.success(assignee ? `Handed to ${assignee.fullName}.` : 'Unassigned.');
      load({ quiet: true });
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setAssigningId(null);
    }
  }

  async function handleAcknowledge(alert) {
    try {
      await acknowledgeAlert(alert.id);
      toast.success(`Acknowledged ${alert.traveller?.fullName ?? 'alert'}.`);
      load({ quiet: true });
    } catch (caught) {
      toast.error(caught.message);
    }
  }

  async function handleResolve(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await resolveAlert(resolving.id, notes);
      toast.success('Alert closed.');
      setResolving(null);
      setNotes('');
      load({ quiet: true });
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setSaving(false);
    }
  }

  const open = alerts.filter((alert) => alert.isOpen);

  return (
    <>
      <PageHeader
        title="Traveller safety"
        subtitle="SOS alerts raised from the traveller app."
        meta={
          open.length > 0 ? (
            <Badge tone="danger">
              {open.length} open alert{open.length === 1 ? '' : 's'}
            </Badge>
          ) : (
            <Badge tone="success">Nothing open</Badge>
          )
        }
        actions={
          <div className="button-group">
            <Button to="/safety/log" size="small" variant="ghost">
              View log
            </Button>
            {['open', 'all'].map((value) => (
              <Button
                key={value}
                variant={filter === value ? 'primary' : 'secondary'}
                size="small"
                onClick={() => setFilter(value)}
              >
                {value === 'open' ? 'Open' : 'All'}
              </Button>
            ))}
          </div>
        }
      />

      {error && <ErrorNotice error={error} onRetry={load} />}
      {loading && <Spinner block label="Loading alerts…" />}

      {!loading && alerts.length === 0 && (
        <EmptyState
          title={filter === 'open' ? 'No open alerts' : 'No alerts recorded'}
          message={
            filter === 'open'
              ? 'Nobody has raised an SOS that is still waiting. This screen refreshes itself every 30 seconds.'
              : 'No traveller has raised an SOS yet.'
          }
        />
      )}

      {!loading &&
        alerts.map((alert) => (
          <Card
            key={alert.id}
            title={alert.traveller?.fullName || 'Traveller'}
            subtitle={
              alert.booking
                ? `${alert.booking.reference} · ${alert.booking.title}`
                : undefined
            }
            actions={
              <div className="button-group">
                {alert.isUnclaimed && <Badge tone="danger">Unclaimed</Badge>}
                <Badge tone={STATUS_TONE[alert.status]}>{alert.status}</Badge>
              </div>
            }
          >
            <dl className="detail-list">
              <div className="detail-list__row">
                <dt>Raised</dt>
                <dd>
                  {formatDateTime(alert.raisedAt)} · {alert.minutesOpen} min
                  {alert.isOpen ? ' and counting' : ''}
                </dd>
              </div>
              <div className="detail-list__row">
                <dt>Position</dt>
                <dd className="mono">{coordinates(alert) || 'Not reported'}</dd>
              </div>
              <div className="detail-list__row">
                <dt>Traveller phone</dt>
                <dd>{alert.traveller?.phone || 'Not recorded'}</dd>
              </div>
              <div className="detail-list__row">
                <dt>Assigned to</dt>
                <dd>
                  {canAct && alert.isOpen ? (
                    <SelectField
                      value={alert.assignedTo?.id || ''}
                      onChange={(event) => handleAssign(alert, event.target.value)}
                      disabled={assigningId === alert.id}
                      placeholder="Unclaimed — pick someone"
                      options={assignableUsers.map((row) => ({
                        value: row.id,
                        label: String(row.id) === String(user.id) ? `${row.fullName} (you)` : row.fullName,
                      }))}
                    />
                  ) : (
                    alert.assignedTo?.fullName || 'Nobody'
                  )}
                </dd>
              </div>
              <div className="detail-list__row">
                <dt>Emergency contact</dt>
                <dd>
                  {alert.traveller?.emergencyContact
                    ? `${alert.traveller.emergencyContact.name} · ${
                        alert.traveller.emergencyContact.phone || 'no number'
                      }`
                    : 'Not recorded'}
                </dd>
              </div>
            </dl>

            {alert.message && <p className="callout">“{alert.message}”</p>}

            {alert.assignedTo && alert.assignedBy && (
              <p className="muted">
                Assigned to {alert.assignedTo.fullName} by {alert.assignedBy.fullName} at{' '}
                {formatDateTime(alert.assignedAt)}.
              </p>
            )}
            {alert.acknowledgedBy && (
              <p className="muted">
                Acknowledged by {alert.acknowledgedBy.fullName} at{' '}
                {formatDateTime(alert.acknowledgedAt)}.
              </p>
            )}
            {alert.resolvedBy && (
              <p className="muted">
                Closed by {alert.resolvedBy.fullName} at {formatDateTime(alert.resolvedAt)} —{' '}
                {alert.resolutionNotes}
              </p>
            )}
            {alert.status === 'cancelled' && (
              <p className="muted">
                Withdrawn by the traveller at {formatDateTime(alert.cancelledAt)}.
              </p>
            )}

            <div className="button-group" style={{ marginTop: 'var(--space-4)' }}>
              {alert.booking && (
                <Button to={`/bookings/${alert.booking.id}`} size="small">
                  Open booking
                </Button>
              )}
              {canAct && alert.status === 'raised' && (
                <Button variant="primary" size="small" onClick={() => handleAcknowledge(alert)}>
                  Acknowledge
                </Button>
              )}
              {canAct && alert.isOpen && (
                <Button
                  variant="danger"
                  size="small"
                  onClick={() => {
                    setResolving(alert);
                    setNotes('');
                  }}
                >
                  Close alert
                </Button>
              )}
            </div>

            <AlertHistory
              alertId={alert.id}
              version={`${alert.status}:${alert.assignedTo?.id || ''}`}
            />
          </Card>
        ))}

      {!canAct && (
        <p className="muted">
          Your role can see alerts but not act on them — acknowledging and closing are recorded
          against the person who did it.
        </p>
      )}

      <Modal
        open={Boolean(resolving)}
        title="Close this alert"
        description="What happened? This is the record an incident review reads."
        onClose={() => setResolving(null)}
        size="small"
      >
        <form onSubmit={handleResolve}>
          <div className="field">
            <label className="field__label" htmlFor="resolution-notes">
              What happened
            </label>
            <textarea
              id="resolution-notes"
              className="field__input"
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              required
            />
          </div>
          <div className="modal__footer">
            <Button onClick={() => setResolving(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={saving}>
              Close alert
            </Button>
          </div>
        </form>
      </Modal>

      <p className="muted" style={{ marginTop: 'var(--space-5)' }}>
        <Link to="/travellers">Travellers</Link> · portal access is granted from a
        traveller&rsquo;s own record.
      </p>
    </>
  );
}
