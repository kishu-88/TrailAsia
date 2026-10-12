import { useState } from 'react';

import Badge from '../../components/common/Badge.jsx';
import Button from '../../components/common/Button.jsx';
import Card from '../../components/common/Card.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import ErrorNotice from '../../components/common/ErrorNotice.jsx';
import Modal, { ConfirmModal } from '../../components/common/Modal.jsx';
import {
  FieldGrid,
  SelectField,
  TextArea,
  TextField,
} from '../../components/common/Field.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { ApiError } from '../../services/apiClient.js';
import * as travellersService from '../../services/travellers.service.js';
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  documentStatusTone,
  formatDate,
  formatDateTime,
  humanise,
} from '../../utils/format.js';
import {
  CONFIRMATION_STATUS_LABELS,
  confirmationStatusTone,
} from '../operators/operatorLabels.js';

const BLANK = {
  type: 'insurance',
  destinationId: '',
  reference: '',
  issuer: '',
  issuedOn: '',
  expiresOn: '',
  altitudeCoverMetres: '',
  insurerContactPhone: '',
  notes: '',
};

/**
 * A traveller's documents: passports, visas, insurance, permits, declarations.
 *
 * Two behaviours here are worth knowing about because they surprise people:
 *
 *  - Verification is a coordinator/admin action, not a consultant one. The
 *    person who records a policy should not be the one attesting it is genuine.
 *  - Editing anything substantive on a verified document drops it back to
 *    "submitted" server-side. That is deliberate, and the form says so, so
 *    nobody thinks the tick disappeared by accident.
 */
export default function DocumentsPanel({
  travellerId,
  documents,
  destinations,
  reviewTasks = [],
  assignableUsers = [],
  canEdit,
  canVerify,
  onChange,
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [values, setValues] = useState(BLANK);
  const [verifying, setVerifying] = useState(null);
  const [verifyNotes, setVerifyNotes] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [reviewerId, setReviewerId] = useState('');
  const [reviewerNote, setReviewerNote] = useState('');
  const [assignError, setAssignError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const reviewTaskByDocumentId = new Map(reviewTasks.map((task) => [task.documentId, task]));

  const set = (key) => (event) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));
  const fieldError = (name) => error?.details?.[name];

  const isInsurance = values.type === 'insurance';

  function openNew() {
    setValues(BLANK);
    setError(null);
    setEditing('new');
  }

  function openEdit(document) {
    setValues({
      type: document.type,
      destinationId: document.destinationId || '',
      reference: document.reference || '',
      issuer: document.issuer || '',
      issuedOn: document.issuedOn || '',
      expiresOn: document.expiresOn || '',
      altitudeCoverMetres: document.altitudeCoverMetres ?? '',
      insurerContactPhone: document.insurerContactPhone || '',
      notes: document.notes || '',
    });
    setError(null);
    setEditing(document);
  }

  async function handleSave(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const payload = {
      type: values.type,
      destinationId: values.destinationId || null,
      reference: values.reference.trim() || null,
      issuer: values.issuer.trim() || null,
      issuedOn: values.issuedOn || null,
      expiresOn: values.expiresOn || null,
      altitudeCoverMetres:
        values.altitudeCoverMetres === '' ? null : Number(values.altitudeCoverMetres),
      insurerContactPhone: values.insurerContactPhone.trim() || null,
      notes: values.notes.trim() || null,
    };

    try {
      if (editing === 'new') {
        await travellersService.addDocument(travellerId, payload);
        toast.success('Document recorded.');
      } else {
        await travellersService.updateDocument(travellerId, editing.id, payload);
        toast.success(
          editing.status === 'verified'
            ? 'Document updated — verification cleared, it needs checking again.'
            : 'Document updated.'
        );
      }
      setEditing(null);
      await onChange();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(approved) {
    setBusy(true);
    try {
      await travellersService.verifyDocument(travellerId, verifying.id, {
        approved,
        notes: verifyNotes.trim() || null,
      });
      setVerifying(null);
      setVerifyNotes('');
      await onChange();
      toast.success(approved ? 'Document verified.' : 'Document rejected.');
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setBusy(false);
    }
  }

  function openAssign(document) {
    const existing = reviewTaskByDocumentId.get(document.id);
    setAssigning(document);
    setReviewerId(existing?.assignee?.id || '');
    setReviewerNote('');
    setAssignError(null);
  }

  async function handleAssignReviewer(event) {
    event.preventDefault();
    if (!reviewerId) return;
    setBusy(true);
    setAssignError(null);
    try {
      await travellersService.assignDocumentReviewer(travellerId, assigning.id, {
        userId: reviewerId,
        note: reviewerNote.trim() || null,
      });
      setAssigning(null);
      await onChange();
      const assignee = assignableUsers.find((row) => String(row.id) === String(reviewerId));
      toast.success(assignee ? `Assigned to ${assignee.fullName}.` : 'Assigned.');
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'BOOKING_REQUIRED') {
        setAssignError(
          'This traveller is on more than one active booking — assign the review from that booking’s Tasks panel instead.'
        );
      } else if (caught instanceof ApiError && caught.code === 'NO_ACTIVE_BOOKING') {
        setAssignError('This traveller is not on any active booking yet.');
      } else {
        setAssignError(caught.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await travellersService.deleteDocument(travellerId, deleting.id);
      setDeleting(null);
      await onChange();
      toast.success('Document deleted.');
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={`Documents (${documents.length})`}
      actions={
        canEdit && (
          <Button size="small" onClick={openNew}>
            Record document
          </Button>
        )
      }
      padded={documents.length === 0}
    >
      {documents.length === 0 ? (
        <EmptyState
          title="No documents recorded"
          message="Passports, visas, insurance and health declarations are tracked here."
          action={canEdit && <Button onClick={openNew}>Record the first one</Button>}
        />
      ) : (
        <ul className="document-list">
          {documents.map((document) => (
            <li key={document.id} className="document">
              <div className="document__body">
                <div className="document__heading">
                  <strong>{DOCUMENT_TYPE_LABELS[document.type] || document.type}</strong>
                  <Badge tone={documentStatusTone(document.effectiveStatus)}>
                    {humanise(document.effectiveStatus)}
                  </Badge>
                  {document.destination && (
                    <span className="muted">{document.destination.name}</span>
                  )}
                </div>

                <p className="muted document__meta">
                  {document.reference ? `${document.reference} · ` : ''}
                  {document.issuer ? `${document.issuer} · ` : ''}
                  {document.expiresOn
                    ? `expires ${formatDate(document.expiresOn)}`
                    : 'no expiry recorded'}
                </p>

                {document.type === 'insurance' && (
                  <p className="muted document__meta">
                    {document.altitudeCoverMetres
                      ? `Altitude cover to ${document.altitudeCoverMetres.toLocaleString()} m`
                      : 'No altitude limit recorded'}
                    {document.insurerContactPhone
                      ? ` · insurer ${document.insurerContactPhone}`
                      : ' · no insurer contact number'}
                  </p>
                )}

                {document.verifiedBy && (
                  <p className="muted document__meta">
                    Checked by {document.verifiedBy.fullName} on{' '}
                    {formatDateTime(document.verifiedAt)}
                  </p>
                )}

                {reviewTaskByDocumentId.has(document.id) && (
                  <p className="muted document__meta">
                    Review assigned to{' '}
                    {reviewTaskByDocumentId.get(document.id).assignee?.fullName || 'someone'}
                  </p>
                )}

                {document.operatorConfirmation && (
                  <p className="muted document__meta">
                    From a ground-operator arrangement: {document.operatorConfirmation.summary}{' '}
                    <Badge tone={confirmationStatusTone(document.operatorConfirmation.status)}>
                      {CONFIRMATION_STATUS_LABELS[document.operatorConfirmation.status] ||
                        document.operatorConfirmation.status}
                    </Badge>
                  </p>
                )}

                {document.notes && <p className="document__notes">{document.notes}</p>}
              </div>

              <div className="document__actions">
                {canEdit && document.status === 'submitted' && (
                  <Button size="small" variant="ghost" onClick={() => openAssign(document)}>
                    {reviewTaskByDocumentId.has(document.id) ? 'Reassign reviewer' : 'Assign reviewer'}
                  </Button>
                )}
                {canVerify && document.effectiveStatus !== 'expired' && (
                  <Button
                    size="small"
                    variant={document.status === 'verified' ? 'ghost' : 'primary'}
                    onClick={() => {
                      setVerifying(document);
                      setVerifyNotes(document.notes || '');
                    }}
                  >
                    {document.status === 'verified' ? 'Re-check' : 'Verify'}
                  </Button>
                )}
                {canEdit && (
                  <>
                    <Button size="small" variant="ghost" onClick={() => openEdit(document)}>
                      Edit
                    </Button>
                    <Button size="small" variant="ghost" onClick={() => setDeleting(document)}>
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(editing)}
        title={editing === 'new' ? 'Record a document' : 'Edit document'}
        onClose={() => setEditing(null)}
      >
        <form onSubmit={handleSave} noValidate>
          {error && !error.details && <ErrorNotice error={error} />}

          {editing !== 'new' && editing?.status === 'verified' && (
            <div className="alert alert--info">
              This document is verified. Changing its reference, issuer, expiry, type or
              altitude cover will clear that, and it will need checking again.
            </div>
          )}

          <FieldGrid>
            <SelectField
              label="Type"
              required
              value={values.type}
              onChange={set('type')}
              error={fieldError('type')}
              options={DOCUMENT_TYPES.map((type) => ({
                value: type,
                label: DOCUMENT_TYPE_LABELS[type],
              }))}
            />
            <SelectField
              label="Destination"
              value={values.destinationId}
              onChange={set('destinationId')}
              error={fieldError('destinationId')}
              placeholder="Applies everywhere"
              options={destinations.map((destination) => ({
                value: destination.id,
                label: destination.name,
              }))}
              hint="Leave blank for a passport."
            />
          </FieldGrid>

          <FieldGrid>
            <TextField
              label="Reference"
              value={values.reference}
              onChange={set('reference')}
              error={fieldError('reference')}
              placeholder="POL-99887"
            />
            <TextField
              label="Issuer"
              value={values.issuer}
              onChange={set('issuer')}
              error={fieldError('issuer')}
            />
          </FieldGrid>

          <FieldGrid>
            <TextField
              label="Issued"
              type="date"
              value={values.issuedOn}
              onChange={set('issuedOn')}
              error={fieldError('issuedOn')}
            />
            <TextField
              label="Expires"
              type="date"
              value={values.expiresOn}
              onChange={set('expiresOn')}
              error={fieldError('expiresOn')}
            />
          </FieldGrid>

          {isInsurance && (
            <FieldGrid>
              <TextField
                label="Altitude cover (m)"
                type="number"
                min="0"
                value={values.altitudeCoverMetres}
                onChange={set('altitudeCoverMetres')}
                error={fieldError('altitudeCoverMetres')}
                hint="Checked against the itinerary's highest point."
              />
              <TextField
                label="Insurer contact"
                value={values.insurerContactPhone}
                onChange={set('insurerContactPhone')}
                error={fieldError('insurerContactPhone')}
                hint="The number to ring before agreeing to an evacuation."
              />
            </FieldGrid>
          )}

          <TextArea
            label="Notes"
            rows={2}
            value={values.notes}
            onChange={set('notes')}
            error={fieldError('notes')}
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

      <Modal
        open={Boolean(verifying)}
        title="Verify document"
        description={
          verifying?.type === 'insurance'
            ? 'Confirm the policy exists and covers what the itinerary needs.'
            : 'Confirm you have sighted this document.'
        }
        onClose={() => setVerifying(null)}
        size="small"
        footer={
          <>
            <Button onClick={() => setVerifying(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => handleVerify(false)} disabled={busy}>
              Reject
            </Button>
            <Button variant="primary" onClick={() => handleVerify(true)} loading={busy}>
              Verify
            </Button>
          </>
        }
      >
        <TextArea
          label="Notes"
          rows={3}
          value={verifyNotes}
          onChange={(event) => setVerifyNotes(event.target.value)}
          hint="How it was checked — for example, confirmed by phone with the insurer."
        />
      </Modal>

      <Modal
        open={Boolean(assigning)}
        title="Assign a reviewer"
        description="Hands this document to someone specific to check. It shows up on their Tasks list like any other work."
        onClose={() => setAssigning(null)}
        size="small"
        footer={
          <>
            <Button onClick={() => setAssigning(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleAssignReviewer}
              loading={busy}
              disabled={!reviewerId}
            >
              Assign
            </Button>
          </>
        }
      >
        <form onSubmit={handleAssignReviewer} noValidate>
          {assignError && <div className="alert alert--error">{assignError}</div>}
          <SelectField
            label="Reviewer"
            required
            value={reviewerId}
            onChange={(event) => setReviewerId(event.target.value)}
            placeholder="Choose someone"
            options={assignableUsers.map((row) => ({ value: row.id, label: row.fullName }))}
          />
          <TextArea
            label="Note (optional)"
            rows={2}
            value={reviewerNote}
            onChange={(event) => setReviewerNote(event.target.value)}
            hint="Anything they should know before they look at it."
          />
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleting)}
        title="Delete this document?"
        message="The record will be removed permanently."
        confirmLabel="Delete"
        loading={busy}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </Card>
  );
}
