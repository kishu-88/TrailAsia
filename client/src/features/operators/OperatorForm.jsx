import { useEffect, useState } from 'react';

import Button from '../../components/common/Button.jsx';
import ErrorNotice from '../../components/common/ErrorNotice.jsx';
import {
  FieldGrid,
  SelectField,
  TextArea,
  TextField,
} from '../../components/common/Field.jsx';
import { listDestinations } from '../../services/destinations.service.js';
import { OPERATOR_TYPES, OPERATOR_TYPE_LABELS } from './operatorLabels.js';

const BLANK = {
  name: '',
  destinationId: '',
  type: 'full_service',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  whatsapp: '',
  typicalResponseDays: 3,
  notes: '',
};

export default function OperatorForm({ operator, onSubmit, onCancel }) {
  const [values, setValues] = useState(() =>
    operator
      ? {
          name: operator.name,
          destinationId: operator.destinationId,
          type: operator.type,
          contactName: operator.contactName || '',
          contactEmail: operator.contactEmail || '',
          contactPhone: operator.contactPhone || '',
          whatsapp: operator.whatsapp || '',
          typicalResponseDays: operator.typicalResponseDays ?? 3,
          notes: operator.notes || '',
        }
      : BLANK
  );
  const [destinations, setDestinations] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listDestinations({ isActive: 'true', perPage: 100 })
      .then((response) => setDestinations(response.data || []))
      .catch(() => setDestinations([]));
  }, []);

  const set = (key) => (event) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));
  const fieldError = (name) => error?.details?.[name];

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      name: values.name.trim(),
      destinationId: values.destinationId,
      type: values.type,
      contactName: values.contactName.trim() || null,
      contactEmail: values.contactEmail.trim() || null,
      contactPhone: values.contactPhone.trim() || null,
      whatsapp: values.whatsapp.trim() || null,
      typicalResponseDays: Number(values.typicalResponseDays) || 0,
      notes: values.notes.trim() || null,
    };
    // Destination is fixed after creation: moving an operator between countries
    // would silently re-scope every confirmation already raised against them.
    if (operator) delete payload.destinationId;

    try {
      await onSubmit(payload);
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {error && !error.details && <ErrorNotice error={error} />}

      <FieldGrid>
        <TextField
          label="Name"
          required
          value={values.name}
          onChange={set('name')}
          error={fieldError('name')}
          placeholder="Himalayan Ascents"
          autoFocus
        />
        {operator ? (
          <TextField
            label="Destination"
            value={operator.destination?.name || ''}
            disabled
            hint="Fixed after creation."
          />
        ) : (
          <SelectField
            label="Destination"
            required
            value={values.destinationId}
            onChange={set('destinationId')}
            error={fieldError('destinationId')}
            placeholder="Choose…"
            options={destinations.map((destination) => ({
              value: destination.id,
              label: destination.name,
            }))}
          />
        )}
      </FieldGrid>

      <FieldGrid>
        <SelectField
          label="Provides"
          value={values.type}
          onChange={set('type')}
          error={fieldError('type')}
          options={OPERATOR_TYPES.map((type) => ({
            value: type,
            label: OPERATOR_TYPE_LABELS[type],
          }))}
        />
        <TextField
          label="Usual turnaround (days)"
          type="number"
          min="0"
          value={values.typicalResponseDays}
          onChange={set('typicalResponseDays')}
          error={fieldError('typicalResponseDays')}
          hint="Sets the default deadline on new requests."
        />
      </FieldGrid>

      <h3 className="form-section">Contact</h3>
      <FieldGrid>
        <TextField
          label="Name"
          value={values.contactName}
          onChange={set('contactName')}
          error={fieldError('contactName')}
        />
        <TextField
          label="Email"
          type="email"
          value={values.contactEmail}
          onChange={set('contactEmail')}
          error={fieldError('contactEmail')}
        />
      </FieldGrid>
      <FieldGrid>
        <TextField
          label="Phone"
          value={values.contactPhone}
          onChange={set('contactPhone')}
          error={fieldError('contactPhone')}
        />
        <TextField
          label="WhatsApp"
          value={values.whatsapp}
          onChange={set('whatsapp')}
          error={fieldError('whatsapp')}
          hint="Recorded because it is how these relationships actually run."
        />
      </FieldGrid>

      <TextArea
        label="Notes"
        rows={3}
        value={values.notes}
        onChange={set('notes')}
        error={fieldError('notes')}
      />

      <div className="form-actions">
        <Button onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={saving}>
          {operator ? 'Save changes' : 'Add operator'}
        </Button>
      </div>
    </form>
  );
}
