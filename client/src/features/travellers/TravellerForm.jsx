import { useState } from 'react';

import Button from '../../components/common/Button.jsx';
import ErrorNotice from '../../components/common/ErrorNotice.jsx';
import { FieldGrid, TextArea, TextField } from '../../components/common/Field.jsx';

const BLANK = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  nationality: '',
  passportNumber: '',
  passportCountry: '',
  passportExpiry: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelationship: '',
  dietaryNotes: '',
  medicalNotes: '',
};

/**
 * Create or edit a traveller.
 *
 * Only the two name fields are required. An enquiry usually starts with a name
 * and a phone number, and forcing a passport number before the record can exist
 * is how people end up keeping the real list somewhere else.
 */
export default function TravellerForm({ traveller, onSubmit, onCancel }) {
  const [values, setValues] = useState(() =>
    traveller
      ? {
          ...BLANK,
          ...Object.fromEntries(
            Object.keys(BLANK).map((key) => [key, traveller[key] ?? ''])
          ),
          // Passport may arrive masked; never write the mask back as a value.
          passportNumber: traveller.passportMasked ? '' : traveller.passportNumber || '',
          emergencyContactName: traveller.emergencyContact?.name || '',
          emergencyContactPhone: traveller.emergencyContact?.phone || '',
          emergencyContactRelationship: traveller.emergencyContact?.relationship || '',
        }
      : BLANK
  );
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (key) => (event) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));
  const fieldError = (name) => error?.details?.[name];

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {};
    for (const [key, value] of Object.entries(values)) {
      const trimmed = typeof value === 'string' ? value.trim() : value;
      payload[key] = trimmed === '' ? null : trimmed;
    }
    payload.firstName = values.firstName.trim();
    payload.lastName = values.lastName.trim();

    // Editing with the passport left blank must not wipe a stored number the
    // user was never shown.
    if (traveller?.passportMasked && !values.passportNumber) {
      delete payload.passportNumber;
    }

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
          label="First name"
          required
          value={values.firstName}
          onChange={set('firstName')}
          error={fieldError('firstName')}
          autoFocus
        />
        <TextField
          label="Last name"
          required
          value={values.lastName}
          onChange={set('lastName')}
          error={fieldError('lastName')}
        />
      </FieldGrid>

      <FieldGrid>
        <TextField
          label="Email"
          type="email"
          value={values.email}
          onChange={set('email')}
          error={fieldError('email')}
        />
        <TextField
          label="Phone"
          value={values.phone}
          onChange={set('phone')}
          error={fieldError('phone')}
        />
      </FieldGrid>

      <FieldGrid>
        <TextField
          label="Date of birth"
          type="date"
          value={values.dateOfBirth}
          onChange={set('dateOfBirth')}
          error={fieldError('dateOfBirth')}
        />
        <TextField
          label="Nationality"
          maxLength={2}
          placeholder="AU"
          value={values.nationality}
          onChange={set('nationality')}
          error={fieldError('nationality')}
          hint="Two-letter country code."
        />
      </FieldGrid>

      <h3 className="form-section">Passport</h3>
      <FieldGrid columns={3}>
        <TextField
          label="Number"
          value={values.passportNumber}
          onChange={set('passportNumber')}
          error={fieldError('passportNumber')}
          placeholder={traveller?.passportMasked ? 'Hidden — leave blank to keep' : ''}
          hint={
            traveller?.passportMasked
              ? 'Your role cannot view the stored number.'
              : undefined
          }
        />
        <TextField
          label="Country"
          maxLength={2}
          placeholder="AU"
          value={values.passportCountry}
          onChange={set('passportCountry')}
          error={fieldError('passportCountry')}
        />
        <TextField
          label="Expiry"
          type="date"
          value={values.passportExpiry}
          onChange={set('passportExpiry')}
          error={fieldError('passportExpiry')}
          hint="Many destinations need six months beyond return."
        />
      </FieldGrid>

      <h3 className="form-section">Emergency contact</h3>
      <FieldGrid columns={3}>
        <TextField
          label="Name"
          value={values.emergencyContactName}
          onChange={set('emergencyContactName')}
          error={fieldError('emergencyContactName')}
        />
        <TextField
          label="Phone"
          value={values.emergencyContactPhone}
          onChange={set('emergencyContactPhone')}
          error={fieldError('emergencyContactPhone')}
        />
        <TextField
          label="Relationship"
          value={values.emergencyContactRelationship}
          onChange={set('emergencyContactRelationship')}
          error={fieldError('emergencyContactRelationship')}
        />
      </FieldGrid>

      <h3 className="form-section">Notes</h3>
      <TextArea
        label="Dietary"
        rows={2}
        value={values.dietaryNotes}
        onChange={set('dietaryNotes')}
        error={fieldError('dietaryNotes')}
      />
      <TextArea
        label="Medical"
        rows={3}
        value={values.medicalNotes}
        onChange={set('medicalNotes')}
        error={fieldError('medicalNotes')}
        hint="Sensitive information under the Privacy Act. Record only what the trip requires."
      />

      <div className="form-actions">
        <Button onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={saving}>
          {traveller ? 'Save changes' : 'Create traveller'}
        </Button>
      </div>
    </form>
  );
}
