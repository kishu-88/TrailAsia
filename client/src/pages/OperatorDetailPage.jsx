import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import Badge from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import Card from '../components/common/Card.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import ErrorNotice from '../components/common/ErrorNotice.jsx';
import Modal, { ConfirmModal } from '../components/common/Modal.jsx';
import Spinner from '../components/common/Spinner.jsx';
import { TextArea } from '../components/common/Field.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import OperatorForm from '../features/operators/OperatorForm.jsx';
import OperatorPortalAccessPanel from '../features/operators/OperatorPortalAccessPanel.jsx';
import {
  CONFIRMATION_STATUS_LABELS,
  OPERATOR_TYPE_LABELS,
  confirmationStatusTone,
  reliabilityTone,
} from '../features/operators/operatorLabels.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import * as operatorsService from '../services/operators.service.js';
import { formatDate, formatDateTime, formatMoney } from '../utils/format.js';
import { can } from '../utils/permissions.js';

export default function OperatorDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();

  const [operator, setOperator] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editing, setEditing] = useState(false);
  const [vetting, setVetting] = useState(null); // 'grant' | 'withdraw'
  const [vettingNotes, setVettingNotes] = useState('');
  const [retiring, setRetiring] = useState(false);
  const [busy, setBusy] = useState(false);

  const editable = can.editReference(user);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [operatorData, confirmations] = await Promise.all([
        operatorsService.getOperator(id),
        operatorsService.listConfirmations({ operatorId: id, perPage: 50, sort: 'createdAt:desc' }),
      ]);
      setOperator(operatorData);
      setHistory(confirmations.data || []);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpdate(payload) {
    const updated = await operatorsService.updateOperator(id, payload);
    setOperator({ ...updated, stats: operator.stats });
    setEditing(false);
    toast.success('Operator updated.');
  }

  async function handleVetting() {
    setBusy(true);
    try {
      await operatorsService.setVetting(id, {
        vetted: vetting === 'grant',
        notes: vettingNotes.trim() || null,
      });
      setVetting(null);
      setVettingNotes('');
      await load();
      toast.success(vetting === 'grant' ? 'Operator vetted.' : 'Vetting withdrawn.');
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRetire() {
    setBusy(true);
    try {
      if (operator.isActive) {
        await operatorsService.deactivateOperator(id);
        toast.success('Operator retired.');
      } else {
        await operatorsService.reactivateOperator(id);
        toast.success('Operator reactivated.');
      }
      setRetiring(false);
      await load();
    } catch (caught) {
      // The server refuses while work is outstanding, and says how much.
      toast.error(caught.message);
      setRetiring(false);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner block label="Loading operator…" />;
  if (error) return <ErrorNotice error={error} onRetry={load} />;
  if (!operator) return null;

  const stats = operator.stats || {};

  return (
    <>
      <PageHeader
        backTo="/operators"
        backLabel="Ground operators"
        title={operator.name}
        subtitle={[operator.destination?.name, OPERATOR_TYPE_LABELS[operator.type]]
          .filter(Boolean)
          .join(' · ')}
        meta={
          <div className="page-header__badges">
            {operator.isVetted ? (
              <Badge tone="success">Vetted</Badge>
            ) : (
              <Badge tone="warning">Not vetted</Badge>
            )}
            {!operator.isActive && <Badge tone="neutral">Retired</Badge>}
          </div>
        }
        actions={
          editable && (
            <>
              <Button onClick={() => setEditing(true)}>Edit</Button>
              <Button
                variant={operator.isVetted ? 'secondary' : 'primary'}
                onClick={() => {
                  setVetting(operator.isVetted ? 'withdraw' : 'grant');
                  setVettingNotes(operator.vettingNotes || '');
                }}
              >
                {operator.isVetted ? 'Withdraw vetting' : 'Vet operator'}
              </Button>
              <Button
                variant={operator.isActive ? 'danger' : 'secondary'}
                onClick={() => setRetiring(true)}
              >
                {operator.isActive ? 'Retire' : 'Reactivate'}
              </Button>
            </>
          )
        }
      />

      {!operator.isVetted && (
        <div className="alert alert--warning">
          <p className="alert__title">This operator has not been vetted</p>
          <p className="alert__message">
            They cannot be given work until a coordinator vets them. Vetting is what the
            agency&rsquo;s partner network is worth — it is the barrier a competitor cannot
            quickly copy.
          </p>
        </div>
      )}

      <div className="detail-grid">
        <div className="detail-grid__main">
          <Card title="Reliability" subtitle="Measured from their answers, not from opinion.">
            {stats.total === 0 ? (
              <EmptyState
                title="No history yet"
                message="Figures appear once this operator has been asked to confirm something."
              />
            ) : (
              <div className="stat-row">
                <div className="stat">
                  <p className="stat__value">
                    {stats.confirmationRate === null ? '—' : `${stats.confirmationRate}%`}
                  </p>
                  <p className="stat__label">Said yes</p>
                  <p className="muted small">Of the requests they answered</p>
                </div>
                <div className="stat">
                  <p className="stat__value">
                    {stats.averageResponseDays === null ? '—' : `${stats.averageResponseDays}d`}
                  </p>
                  <p className="stat__label">Average reply time</p>
                  <p className="muted small">Stated turnaround {operator.typicalResponseDays}d</p>
                </div>
                <div className="stat">
                  <p className="stat__value">{stats.outstanding}</p>
                  <p className="stat__label">Awaiting reply</p>
                  {stats.overdue > 0 && (
                    <p className="muted small">{stats.overdue} past deadline</p>
                  )}
                </div>
              </div>
            )}

            {stats.confirmationRate !== null && stats.confirmationRate !== undefined && (
              <p className="muted" style={{ marginTop: 'var(--space-4)' }}>
                <Badge tone={reliabilityTone(stats.confirmationRate)}>
                  {stats.confirmed} confirmed · {stats.declined} declined
                </Badge>
              </p>
            )}
          </Card>

          <Card title={`History (${history.length})`} padded={history.length === 0}>
            {history.length === 0 ? (
              <EmptyState
                title="Nothing raised yet"
                message="Confirmations are raised from a booking."
              />
            ) : (
              <ul className="confirmation-list">
                {history.map((row) => (
                  <li key={row.id} className="confirmation">
                    <div className="confirmation__body">
                      <div className="confirmation__heading">
                        <strong>{row.summary}</strong>
                        <Badge tone={confirmationStatusTone(row.status)}>
                          {CONFIRMATION_STATUS_LABELS[row.status] || row.status}
                        </Badge>
                      </div>
                      <p className="muted confirmation__meta">
                        {row.booking && (
                          <Link to={`/bookings/${row.booking.id}`} className="link link--mono">
                            {row.booking.reference}
                          </Link>
                        )}
                        {row.respondedAt && ` · replied ${formatDate(row.respondedAt)}`}
                        {row.responseDays !== null &&
                          row.responseDays !== undefined &&
                          ` in ${row.responseDays}d`}
                        {row.amount && ` · ${formatMoney(row.amount, row.currencyCode)}`}
                      </p>
                      {row.declineReason && (
                        <p className="confirmation__decline">Declined: {row.declineReason}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="detail-grid__side">
          <OperatorPortalAccessPanel
            operator={operator}
            canEdit={editable}
            onChange={load}
          />

          <Card title="Contact">
            <dl className="detail-list">
              <Row label="Contact" value={operator.contactName} />
              <Row
                label="Email"
                value={
                  operator.contactEmail ? (
                    <a className="link" href={`mailto:${operator.contactEmail}`}>
                      {operator.contactEmail}
                    </a>
                  ) : null
                }
              />
              <Row
                label="Phone"
                value={
                  operator.contactPhone ? (
                    <a className="link" href={`tel:${operator.contactPhone.replace(/\s/g, '')}`}>
                      {operator.contactPhone}
                    </a>
                  ) : null
                }
              />
              <Row label="WhatsApp" value={operator.whatsapp} />
              <Row label="Usual turnaround" value={`${operator.typicalResponseDays} days`} />
            </dl>
          </Card>

          <Card title="Vetting">
            {operator.isVetted ? (
              <dl className="detail-list">
                <Row label="Vetted" value={formatDateTime(operator.vettedAt)} />
                <Row label="By" value={operator.vettedBy?.fullName} />
              </dl>
            ) : (
              <p className="muted">Not vetted.</p>
            )}
            {operator.vettingNotes && (
              <p className="preserve-lines" style={{ marginTop: 'var(--space-3)' }}>
                {operator.vettingNotes}
              </p>
            )}
          </Card>

          {operator.notes && (
            <Card title="Notes" muted>
              <p className="preserve-lines">{operator.notes}</p>
            </Card>
          )}
        </div>
      </div>

      <Modal open={editing} title="Edit operator" onClose={() => setEditing(false)}>
        <OperatorForm
          operator={operator}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(false)}
        />
      </Modal>

      <Modal
        open={Boolean(vetting)}
        title={vetting === 'grant' ? 'Vet this operator' : 'Withdraw vetting'}
        onClose={() => setVetting(null)}
        size="small"
        footer={
          <>
            <Button onClick={() => setVetting(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={vetting === 'grant' ? 'primary' : 'danger'}
              onClick={handleVetting}
              loading={busy}
            >
              {vetting === 'grant' ? 'Vet operator' : 'Withdraw'}
            </Button>
          </>
        }
      >
        <p className="muted">
          {vetting === 'grant'
            ? 'Recorded against your name and today’s date. Only vetted operators can be given work.'
            : 'They will not be able to take new work. Existing confirmations are unaffected.'}
        </p>
        <TextArea
          label="Notes"
          rows={3}
          value={vettingNotes}
          onChange={(event) => setVettingNotes(event.target.value)}
          hint="What was checked — licences, insurance, references."
        />
      </Modal>

      <ConfirmModal
        open={retiring}
        title={operator.isActive ? 'Retire this operator?' : 'Reactivate this operator?'}
        message={
          operator.isActive
            ? 'They will not appear when raising new confirmations. Past trips keep their record. Refused if anything is still outstanding.'
            : 'They will be available for new confirmations again.'
        }
        confirmLabel={operator.isActive ? 'Retire' : 'Reactivate'}
        variant={operator.isActive ? 'danger' : 'primary'}
        loading={busy}
        onConfirm={handleRetire}
        onClose={() => setRetiring(false)}
      />
    </>
  );
}

function Row({ label, value }) {
  return (
    <div className="detail-list__row">
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  );
}
