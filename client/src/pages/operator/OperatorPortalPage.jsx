import { useCallback, useEffect, useState } from 'react';

import Badge from '../../components/common/Badge.jsx';
import Button from '../../components/common/Button.jsx';
import Card from '../../components/common/Card.jsx';
import ErrorNotice from '../../components/common/ErrorNotice.jsx';
import Modal from '../../components/common/Modal.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import {
  CONFIRMATION_STATUS_LABELS,
  confirmationStatusTone,
} from '../../features/operators/operatorLabels.js';
import { useOperatorAuth } from '../../context/OperatorAuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { listConfirmations, respondToConfirmation } from '../../services/operatorAuth.service.js';
import { formatDate, formatMoney } from '../../utils/format.js';

/**
 * The operator's own view of what TrailAsia has asked of them.
 *
 * One list, one action — answer a request — because that is the entire job
 * this portal exists to do. The directory, vetting and the agency's own
 * chase list are staff-only and stay in the staff app.
 */
export default function OperatorPortalPage() {
  const { operator } = useOperatorAuth();
  const toast = useToast();

  const [confirmations, setConfirmations] = useState(null);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [responding, setResponding] = useState(null); // the confirmation being answered
  const [decision, setDecision] = useState(true);
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await listConfirmations(statusFilter ? { status: statusFilter } : {});
      setConfirmations(response.data || []);
    } catch (caught) {
      setError(caught);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  function openRespond(confirmation, confirmed) {
    setResponding(confirmation);
    setDecision(confirmed);
    setReference(confirmation.operatorReference || '');
    setReason('');
  }

  async function submitResponse(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await respondToConfirmation(responding.id, {
        confirmed: decision,
        operatorReference: reference || undefined,
        reason: decision ? undefined : reason,
      });
      toast.success(decision ? 'Recorded as confirmed.' : 'Recorded as declined.');
      setResponding(null);
      load();
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title={operator?.name || 'Your requests'}
        subtitle="Confirmations TrailAsia has asked you about."
        actions={
          <select
            className="field__input"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            style={{ width: 'auto' }}
          >
            <option value="">All</option>
            <option value="requested">Awaiting your answer</option>
            <option value="confirmed">Confirmed</option>
            <option value="declined">Declined</option>
          </select>
        }
      />

      <Card>
        {error && <ErrorNotice error={error} onRetry={load} />}
        {!error && confirmations === null && <Spinner label="Loading requests…" />}
        {!error && confirmations && confirmations.length === 0 && (
          <p className="muted">No requests here yet.</p>
        )}
        {!error && confirmations && confirmations.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Request</th>
                <th>Due</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {confirmations.map((confirmation) => (
                <tr key={confirmation.id}>
                  <td>
                    {confirmation.booking ? (
                      <>
                        <div>{confirmation.booking.title}</div>
                        <div className="muted small">{confirmation.booking.reference}</div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <div>{confirmation.summary}</div>
                    {confirmation.amount && (
                      <div className="muted small">
                        {formatMoney(confirmation.amount, confirmation.currencyCode)}
                      </div>
                    )}
                  </td>
                  <td>{confirmation.dueBy ? formatDate(confirmation.dueBy) : '—'}</td>
                  <td>
                    <Badge tone={confirmationStatusTone(confirmation.status)}>
                      {CONFIRMATION_STATUS_LABELS[confirmation.status] || confirmation.status}
                    </Badge>
                  </td>
                  <td>
                    {confirmation.status === 'requested' && (
                      <div className="button-group">
                        <Button
                          variant="primary"
                          size="small"
                          onClick={() => openRespond(confirmation, true)}
                        >
                          Confirm
                        </Button>
                        <Button
                          variant="danger"
                          size="small"
                          onClick={() => openRespond(confirmation, false)}
                        >
                          Decline
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={Boolean(responding)}
        title={decision ? 'Confirm this request' : 'Decline this request'}
        onClose={() => setResponding(null)}
        footer={
          <>
            <Button onClick={() => setResponding(null)}>Cancel</Button>
            <Button variant="primary" loading={submitting} onClick={submitResponse}>
              {decision ? 'Confirm' : 'Decline'}
            </Button>
          </>
        }
      >
        <form onSubmit={submitResponse}>
          {decision && (
            <div className="field">
              <label className="field__label" htmlFor="operator-reference">
                Your reference (optional)
              </label>
              <input
                id="operator-reference"
                className="field__input"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            </div>
          )}
          {!decision && (
            <div className="field">
              <label className="field__label" htmlFor="decline-reason">
                Why are you declining?
              </label>
              <textarea
                id="decline-reason"
                className="field__input"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
              />
            </div>
          )}
        </form>
      </Modal>
    </>
  );
}
