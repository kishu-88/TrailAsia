import { useState } from 'react';

import Badge from '../../components/common/Badge.jsx';
import Button from '../../components/common/Button.jsx';
import Card from '../../components/common/Card.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import ErrorNotice from '../../components/common/ErrorNotice.jsx';
import Modal, { ConfirmModal } from '../../components/common/Modal.jsx';
import {
  CheckboxField,
  FieldGrid,
  SelectField,
  TextArea,
  TextField,
} from '../../components/common/Field.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import * as destinationsService from '../../services/destinations.service.js';
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES, humanise } from '../../utils/format.js';

const BLANK = {
  type: 'visa',
  name: '',
  description: '',
  isMandatory: true,
  leadTimeDays: 14,
  minValidityMonths: '',
  requiresAltitudeCover: false,
};

/** The rules that drive every traveller checklist for this destination. */
export default function RequirementsPanel({ destinationId, requirements, canEdit, onChange }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [values, setValues] = useState(BLANK);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (event) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));
  const setBool = (key) => (event) =>
    setValues((current) => ({ ...current, [key]: event.target.checked }));
  const fieldError = (name) => error?.details?.[name];

  function openNew() {
    setValues(BLANK);
    setError(null);
    setEditing('new');
  }

  function openEdit(requirement) {
    setValues({
      type: requirement.type,
      name: requirement.name,
      description: requirement.description || '',
      isMandatory: requirement.isMandatory,
      leadTimeDays: requirement.leadTimeDays,
      minValidityMonths: requirement.minValidityMonths ?? '',
      requiresAltitudeCover: requirement.requiresAltitudeCover,
    });
    setError(null);
    setEditing(requirement);
  }

  async function handleSave(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const payload = {
      type: values.type,
      name: values.name.trim(),
      description: values.description.trim() || null,
      isMandatory: Boolean(values.isMandatory),
      leadTimeDays: Number(values.leadTimeDays) || 0,
      minValidityMonths:
        values.minValidityMonths === '' ? null : Number(values.minValidityMonths),
      requiresAltitudeCover: Boolean(values.requiresAltitudeCover),
    };

    try {
      if (editing === 'new') {
        await destinationsService.addRequirement(destinationId, payload);
        toast.success('Requirement added.');
      } else {
        await destinationsService.updateRequirement(destinationId, editing.id, payload);
        toast.success('Requirement updated.');
      }
      setEditing(null);
      await onChange();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await destinationsService.deleteRequirement(destinationId, deleting.id);
      setDeleting(null);
      await onChange();
      toast.success('Requirement deleted.');
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={`Document requirements (${requirements.length})`}
      subtitle="Every traveller checklist for this destination is built from these."
      actions={
        canEdit && (
          <Button size="small" onClick={openNew}>
            Add requirement
          </Button>
        )
      }
      padded={requirements.length === 0}
    >
      {requirements.length === 0 ? (
        <EmptyState
          title="No requirements set"
          message="Without these, checklists for this destination will come back empty."
          action={canEdit && <Button onClick={openNew}>Add the first one</Button>}
        />
      ) : (
        <ul className="requirement-list">
          {requirements.map((requirement) => (
            <li key={requirement.id} className="requirement">
              <div className="requirement__body">
                <div className="requirement__heading">
                  <strong>{requirement.name}</strong>
                  <Badge tone="neutral">
                    {DOCUMENT_TYPE_LABELS[requirement.type] || humanise(requirement.type)}
                  </Badge>
                  {!requirement.isMandatory && <Badge tone="neutral">Optional</Badge>}
                  {requirement.requiresAltitudeCover && (
                    <Badge tone="warning">Altitude cover</Badge>
                  )}
                  {!requirement.isActive && <Badge tone="neutral">Inactive</Badge>}
                </div>

                <p className="muted requirement__meta">
                  Due {requirement.leadTimeDays} days before departure
                  {requirement.minValidityMonths
                    ? ` · must stay valid ${requirement.minValidityMonths} months past return`
                    : ''}
                </p>

                {requirement.description && (
                  <p className="requirement__detail">{requirement.description}</p>
                )}
              </div>

              {canEdit && (
                <div className="requirement__actions">
                  <Button size="small" variant="ghost" onClick={() => openEdit(requirement)}>
                    Edit
                  </Button>
                  <Button size="small" variant="ghost" onClick={() => setDeleting(requirement)}>
                    Delete
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(editing)}
        title={editing === 'new' ? 'Add a requirement' : 'Edit requirement'}
        onClose={() => setEditing(null)}
      >
        <form onSubmit={handleSave} noValidate>
          {error && !error.details && <ErrorNotice error={error} />}

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
            <TextField
              label="Name"
              required
              value={values.name}
              onChange={set('name')}
              error={fieldError('name')}
              placeholder="High-altitude trekking cover"
            />
          </FieldGrid>

          <FieldGrid>
            <TextField
              label="Lead time (days)"
              type="number"
              min="0"
              value={values.leadTimeDays}
              onChange={set('leadTimeDays')}
              error={fieldError('leadTimeDays')}
              hint="How far before departure this must be done."
            />
            <TextField
              label="Validity beyond return (months)"
              type="number"
              min="0"
              value={values.minValidityMonths}
              onChange={set('minValidityMonths')}
              error={fieldError('minValidityMonths')}
              hint="Passports usually six."
            />
          </FieldGrid>

          <TextArea
            label="Description"
            rows={3}
            value={values.description}
            onChange={set('description')}
            error={fieldError('description')}
          />

          <CheckboxField
            label="Mandatory"
            hint="Only mandatory items block readiness."
            checked={values.isMandatory}
            onChange={setBool('isMandatory')}
          />
          <CheckboxField
            label="Requires stated altitude cover"
            hint="Insurance must state an altitude limit and an insurer contact number."
            checked={values.requiresAltitudeCover}
            onChange={setBool('requiresAltitudeCover')}
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

      <ConfirmModal
        open={Boolean(deleting)}
        title="Delete this requirement?"
        message={`"${deleting?.name}" will stop appearing on checklists. If past checklists should still make sense, edit it and untick Mandatory instead.`}
        confirmLabel="Delete"
        loading={busy}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </Card>
  );
}
