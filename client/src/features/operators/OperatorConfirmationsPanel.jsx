import { useCallback, useEffect, useState } from 'react';

import Badge from '../../components/common/Badge.jsx';
import Button from '../../components/common/Button.jsx';
import Card from '../../components/common/Card.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import ErrorNotice from '../../components/common/ErrorNotice.jsx';
import Modal, { ConfirmModal } from '../../components/common/Modal.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import {
  FieldGrid,
  SelectField,
  TextArea,
  TextField,
} from '../../components/common/Field.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import * as operatorsService from '../../services/operators.service.js';
import * as travellersService from '../../services/travellers.service.js';
import {
  DOCUMENT_TYPE_LABELS,
  documentStatusTone,
  formatDate,
  formatMoney,
  relativeDays,
} from '../../utils/format.js';
import {
  CONFIRMATION_STATUS_LABELS,
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  confirmationStatusTone,
} from './operatorLabels.js';

const BLANK = {
  operatorId: '',
  itinerarySegmentId: '',
  serviceType: 'other',
  summary: '',
  details: '',
  dueBy: '',
  currencyCode: 'AUD',
  amount: '',
};

/**
 * Ground-operator confirmations for one booking.
 *
 * The business case names the problem this replaces: partner confirmations held
 * in personal inboxes and messaging apps, so nobody but the owning consultant
 * knows what has actually been agreed. Every row here is one thing somebody has
 * asked an operator for, with a status and a date an answer is needed by.
 */
export default function OperatorConfirmationsPanel({ booking, segments, canEdit }) {
  const toast = useToast();

  const [readiness, setReadiness] = useState(null);
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editing, setEditing] = useState(null); // 'new' | confirmation
  const [values, setValues] = useState(BLANK);
  const [formError, setFormError] = useState(null);

  const [responding, setResponding] = useState(null);
  const [responseRef, setResponseRef] = useState('');
  const [responseAmount, setResponseAmount] = useState('');
  const [declineReason, setDeclineReason] = useState('');

  const [cancelling, setCancelling] = useState(null);
  const [busy, setBusy] = useState(false);

  const [linking, setLinking] = useState(null); // the confirmation gaining a document
  const [linkTravellerId, setLinkTravellerId] = useState('');
  const [travellerDocuments, setTravellerDocuments] = useState([]);
  const [linkDocumentId, setLinkDocumentId] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [unlinking, setUnlinking] = useState(null); // the document losing its link

  const travellers = booking.travellers || [];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReadiness(await operatorsService.getBookingReadiness(booking.id));
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [booking.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Only vetted, active operators for the destinations this trip visits — the
  // server refuses anything else, so offering it would be a pointless round trip.
  const loadOperators = useCallback(async () => {
    const destinationIds = [
      ...new Set((segments || []).map((segment) => String(segment.destinationId))),
    ];
    if (destinationIds.length === 0) {
      setOperators([]);
      return;
    }
    try {
      const responses = await Promise.all(
        destinationIds.map((destinationId) =>
          operatorsService.listOperators({
            destinationId,
            isActive: 'true',
            vetted: 'true',
            perPage: 100,
          })
        )
      );
      setOperators(responses.flatMap((response) => response.data || []));
    } catch {
      setOperators([]);
    }
  }, [segments]);

  const set = (key) => (event) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));
  const fieldError = (name) => formError?.details?.[name];

  function openNew() {
    setValues(BLANK);
    setFormError(null);
    setEditing('new');
    loadOperators();
  }

  function openEdit(confirmation) {
    setValues({
      operatorId: confirmation.operatorId,
      itinerarySegmentId: confirmation.itinerarySegmentId || '',
      serviceType: confirmation.serviceType,
      summary: confirmation.summary,
      details: confirmation.details || '',
      dueBy: confirmation.dueBy || '',
      currencyCode: confirmation.currencyCode,
      amount: confirmation.amount || '',
    });
    setFormError(null);
    setEditing(confirmation);
    loadOperators();
  }

  async function handleSave(event) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);

    const common = {
      itinerarySegmentId: values.itinerarySegmentId || null,
      serviceType: values.serviceType,
      summary: values.summary.trim(),
      details: values.details.trim() || null,
      dueBy: values.dueBy || null,
      currencyCode: values.currencyCode,
      amount: values.amount === '' ? null : values.amount,
    };

    try {
      if (editing === 'new') {
        await operatorsService.addConfirmation({
          ...common,
          bookingId: booking.id,
          operatorId: values.operatorId,
        });
        toast.success('Confirmation raised.');
      } else {
        await operatorsService.updateConfirmation(editing.id, common);
        toast.success('Confirmation updated.');
      }
      setEditing(null);
      await load();
    } catch (caught) {
      setFormError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function handleRequest(confirmation) {
    setBusy(true);
    try {
      await operatorsService.markRequested(confirmation.id);
      await load();
      toast.success('Marked as sent.');
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRespond(confirmed) {
    setBusy(true);
    try {
      await operatorsService.respond(responding.id, {
        confirmed,
        operatorReference: responseRef.trim() || null,
        amount: responseAmount === '' ? undefined : responseAmount,
        reason: confirmed ? null : declineReason.trim(),
      });
      setResponding(null);
      setResponseRef('');
      setResponseAmount('');
      setDeclineReason('');
      await load();
      toast.success(confirmed ? 'Confirmed.' : 'Recorded as declined.');
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    setBusy(true);
    try {
      await operatorsService.cancelConfirmation(cancelling.id);
      setCancelling(null);
      await load();
      toast.success('Confirmation cancelled.');
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setBusy(false);
    }
  }

  function openLink(confirmation) {
    setLinking(confirmation);
    setLinkDocumentId('');
    setTravellerDocuments([]);
    // The common case — one traveller on the booking — needs no choice at all.
    setLinkTravellerId(travellers.length === 1 ? travellers[0].id : '');
    if (travellers.length === 1) loadTravellerDocuments(travellers[0].id);
  }

  async function loadTravellerDocuments(travellerId) {
    setLinkLoading(true);
    setLinkDocumentId('');
    try {
      const response = await travellersService.listDocuments(travellerId);
      setTravellerDocuments(response.data || []);
    } catch {
      setTravellerDocuments([]);
    } finally {
      setLinkLoading(false);
    }
  }

  function handleLinkTravellerChange(event) {
    const travellerId = event.target.value;
    setLinkTravellerId(travellerId);
    if (travellerId) loadTravellerDocuments(travellerId);
    else setTravellerDocuments([]);
  }

  async function handleLinkDocument(event) {
    event.preventDefault();
    if (!linkDocumentId) return;
    setBusy(true);
    try {
      await travellersService.updateDocument(linkTravellerId, linkDocumentId, {
        operatorConfirmationId: linking.id,
      });
      setLinking(null);
      await load();
      toast.success('Document linked.');
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlinkDocument() {
    setBusy(true);
    try {
      await travellersService.updateDocument(unlinking.travellerId, unlinking.id, {
        operatorConfirmationId: null,
      });
      setUnlinking(null);
      await load();
      toast.success('Document unlinked.');
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Card title="Ground operators">
        <Spinner block label="Loading confirmations…" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Ground operators">
        <ErrorNotice error={error} onRetry={load} />
      </Card>
    );
  }

  const { summary, confirmations, uncoveredSegments } = readiness;

  return (
    <Card
      title="Ground operators"
      subtitle={
        summary.total > 0
          ? `${summary.confirmed} of ${summary.total} confirmed`
          : undefined
      }
      actions={
        canEdit && (
          <Button size="small" onClick={openNew}>
            Raise confirmation
          </Button>
        )
      }
      padded={summary.total === 0 && uncoveredSegments.length === 0}
    >
      {summary.total > 0 && (
        <div
          className={`readiness-banner readiness-banner--${summary.ready ? 'ready' : 'blocked'}`}
        >
          <p className="readiness-banner__headline">
            {summary.ready
              ? 'Every arrangement is confirmed'
              : `${summary.outstanding + summary.declined} arrangement${
                  summary.outstanding + summary.declined === 1 ? '' : 's'
                } need attention`}
          </p>
          <p className="muted">
            {summary.outstanding} awaiting a reply
            {summary.overdue > 0 && ` · ${summary.overdue} past its deadline`}
            {summary.declined > 0 && ` · ${summary.declined} declined`}
          </p>
        </div>
      )}

      {uncoveredSegments.length > 0 && (
        <div className="alert alert--warning" style={{ margin: 'var(--space-4)' }}>
          <p className="alert__title">
            {uncoveredSegments.length} itinerary leg
            {uncoveredSegments.length === 1 ? ' has' : 's have'} no operator arranged
          </p>
          <p className="alert__message">
            {uncoveredSegments.map((segment) => segment.title).join(', ')}
          </p>
        </div>
      )}

      {summary.total === 0 ? (
        <EmptyState
          title="Nothing arranged yet"
          message="Raise a confirmation for each guide, lodge and transfer this trip depends on."
          action={canEdit && <Button onClick={openNew}>Raise the first one</Button>}
        />
      ) : (
        <ul className="confirmation-list">
          {confirmations.map((confirmation) => (
            <li key={confirmation.id} className="confirmation">
              <div className="confirmation__body">
                <div className="confirmation__heading">
                  <strong>{confirmation.summary}</strong>
                  <Badge tone={confirmationStatusTone(confirmation.status)}>
                    {CONFIRMATION_STATUS_LABELS[confirmation.status] || confirmation.status}
                  </Badge>
                  {confirmation.overdue && <Badge tone="danger">Overdue</Badge>}
                </div>

                <p className="muted confirmation__meta">
                  {confirmation.operator?.name}
                  {' · '}
                  {SERVICE_TYPE_LABELS[confirmation.serviceType] || confirmation.serviceType}
                  {confirmation.segment && ` · leg ${confirmation.segment.sequence}`}
                </p>

                <p className="muted confirmation__meta">
                  {confirmation.dueBy
                    ? `Answer needed by ${formatDate(confirmation.dueBy)} (${relativeDays(
                        confirmation.dueBy
                      )})`
                    : 'No deadline set'}
                  {confirmation.amount &&
                    ` · ${formatMoney(confirmation.amount, confirmation.currencyCode)}`}
                  {confirmation.operatorReference && ` · ref ${confirmation.operatorReference}`}
                </p>

                {confirmation.status === 'declined' && confirmation.declineReason && (
                  <p className="confirmation__decline">
                    Declined: {confirmation.declineReason}
                  </p>
                )}

                {/* What this arrangement actually produced — a permit, mainly.
                    Linked from the traveller's own document record, so this is
                    just where that connection is read back from the booking. */}
                {(confirmation.documents || []).length > 0 && (
                  <ul className="confirmation__documents">
                    {confirmation.documents.map((document) => (
                      <li key={document.id}>
                        <Badge tone={documentStatusTone(document.effectiveStatus)}>
                          {DOCUMENT_TYPE_LABELS[document.type] || document.type}
                        </Badge>
                        {canEdit && (
                          <button
                            type="button"
                            className="link link--muted"
                            onClick={() => setUnlinking(document)}
                          >
                            Unlink
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {canEdit && (
                <div className="confirmation__actions">
                  {confirmation.status === 'pending' && (
                    <Button
                      size="small"
                      variant="primary"
                      disabled={busy}
                      onClick={() => handleRequest(confirmation)}
                    >
                      Mark sent
                    </Button>
                  )}
                  {confirmation.allowedNextStatuses.includes('confirmed') && (
                    <Button
                      size="small"
                      variant="primary"
                      onClick={() => {
                        setResponding(confirmation);
                        setResponseRef(confirmation.operatorReference || '');
                        setResponseAmount(confirmation.amount || '');
                        setDeclineReason('');
                      }}
                    >
                      Record reply
                    </Button>
                  )}
                  <Button size="small" variant="ghost" onClick={() => openLink(confirmation)}>
                    Link a document
                  </Button>
                  <Button size="small" variant="ghost" onClick={() => openEdit(confirmation)}>
                    Edit
                  </Button>
                  {confirmation.status !== 'cancelled' && (
                    <Button
                      size="small"
                      variant="ghost"
                      onClick={() => setCancelling(confirmation)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* --- Raise / edit ------------------------------------------------- */}

      <Modal
        open={Boolean(editing)}
        title={editing === 'new' ? 'Raise a confirmation' : 'Edit confirmation'}
        onClose={() => setEditing(null)}
      >
        <form onSubmit={handleSave} noValidate>
          {formError && !formError.details && <ErrorNotice error={formError} />}

          {editing === 'new' && (
            <SelectField
              label="Operator"
              required
              value={values.operatorId}
              onChange={set('operatorId')}
              error={fieldError('operatorId')}
              placeholder="Choose…"
              options={operators.map((operator) => ({
                value: operator.id,
                label: `${operator.name} · ${operator.destination?.name || ''}`,
              }))}
              hint={
                operators.length === 0
                  ? 'No vetted operators for this itinerary’s destinations yet. A coordinator adds and vets them under Operators.'
                  : 'Only vetted, active operators appear here.'
              }
            />
          )}

          <TextField
            label="What is being confirmed"
            required
            value={values.summary}
            onChange={set('summary')}
            error={fieldError('summary')}
            placeholder="Guides and porters, Lukla to base camp"
          />

          <FieldGrid>
            <SelectField
              label="Service"
              value={values.serviceType}
              onChange={set('serviceType')}
              error={fieldError('serviceType')}
              options={SERVICE_TYPES.map((type) => ({
                value: type,
                label: SERVICE_TYPE_LABELS[type],
              }))}
            />
            <SelectField
              label="Itinerary leg"
              value={values.itinerarySegmentId}
              onChange={set('itinerarySegmentId')}
              error={fieldError('itinerarySegmentId')}
              placeholder="Whole trip"
              options={(segments || []).map((segment) => ({
                value: segment.id,
                label: `${segment.sequence}. ${segment.title}`,
              }))}
            />
          </FieldGrid>

          <FieldGrid columns={3}>
            <TextField
              label="Answer needed by"
              type="date"
              value={values.dueBy}
              onChange={set('dueBy')}
              error={fieldError('dueBy')}
              hint="Defaults from their turnaround."
            />
            <TextField
              label="Currency"
              maxLength={3}
              value={values.currencyCode}
              onChange={set('currencyCode')}
              error={fieldError('currencyCode')}
            />
            <TextField
              label="Cost"
              inputMode="decimal"
              value={values.amount}
              onChange={set('amount')}
              error={fieldError('amount')}
              placeholder="145000.00"
            />
          </FieldGrid>

          <TextArea
            label="Details"
            rows={3}
            value={values.details}
            onChange={set('details')}
            error={fieldError('details')}
          />

          <div className="form-actions">
            <Button onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      {/* --- Record the operator's reply ----------------------------------- */}

      <Modal
        open={Boolean(responding)}
        title="Record the operator's reply"
        description={responding?.summary}
        onClose={() => setResponding(null)}
        size="small"
        footer={
          <>
            <Button onClick={() => setResponding(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => handleRespond(false)}
              disabled={busy || declineReason.trim().length < 3}
            >
              Declined
            </Button>
            <Button variant="primary" onClick={() => handleRespond(true)} loading={busy}>
              Confirmed
            </Button>
          </>
        }
      >
        <TextField
          label="Their reference"
          value={responseRef}
          onChange={(event) => setResponseRef(event.target.value)}
          placeholder="HA-8891"
        />
        <TextField
          label="Agreed cost"
          inputMode="decimal"
          value={responseAmount}
          onChange={(event) => setResponseAmount(event.target.value)}
          hint={`In ${responding?.currencyCode || 'AUD'}.`}
        />
        <TextArea
          label="Reason, if declining"
          rows={2}
          value={declineReason}
          onChange={(event) => setDeclineReason(event.target.value)}
          hint="Required to record a decline — it is what makes a partner's history readable later."
        />
      </Modal>

      <ConfirmModal
        open={Boolean(cancelling)}
        title="Cancel this confirmation?"
        message={`"${cancelling?.summary}" will be marked cancelled. The record stays for the audit trail.`}
        confirmLabel="Cancel it"
        loading={busy}
        onConfirm={handleCancel}
        onClose={() => setCancelling(null)}
      />

      {/* --- Link an existing document to this confirmation ------------------ */}

      <Modal
        open={Boolean(linking)}
        title="Link a document"
        description={linking?.summary}
        onClose={() => setLinking(null)}
        size="small"
        footer={
          <>
            <Button onClick={() => setLinking(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleLinkDocument}
              loading={busy}
              disabled={!linkDocumentId}
            >
              Link
            </Button>
          </>
        }
      >
        <form onSubmit={handleLinkDocument} noValidate>
          {travellers.length > 1 && (
            <SelectField
              label="Traveller"
              required
              value={linkTravellerId}
              onChange={handleLinkTravellerChange}
              placeholder="Choose…"
              options={travellers.map((traveller) => ({
                value: traveller.id,
                label: traveller.fullName,
              }))}
            />
          )}

          {linkTravellerId && (
            <SelectField
              label="Document"
              required
              value={linkDocumentId}
              onChange={(event) => setLinkDocumentId(event.target.value)}
              placeholder={linkLoading ? 'Loading…' : 'Choose…'}
              disabled={linkLoading}
              options={travellerDocuments.map((document) => ({
                value: document.id,
                label: `${DOCUMENT_TYPE_LABELS[document.type] || document.type}${
                  document.reference ? ` · ${document.reference}` : ''
                }${
                  document.operatorConfirmationId && document.operatorConfirmationId !== linking?.id
                    ? ' (linked elsewhere)'
                    : ''
                }`,
              }))}
              hint={
                !linkLoading && travellerDocuments.length === 0
                  ? 'This traveller has no documents recorded yet.'
                  : 'Choosing an already-linked document moves it here.'
              }
            />
          )}
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(unlinking)}
        title="Unlink this document?"
        message="The document record itself is untouched — this only removes the connection to the confirmation."
        confirmLabel="Unlink"
        loading={busy}
        onConfirm={handleUnlinkDocument}
        onClose={() => setUnlinking(null)}
      />
    </Card>
  );
}
