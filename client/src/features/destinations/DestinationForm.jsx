import { useState } from 'react';

import Button from '../../components/common/Button.jsx';
import ErrorNotice from '../../components/common/ErrorNotice.jsx';
import { FieldGrid, TextArea, TextField } from '../../components/common/Field.jsx';

export default function DestinationForm({ destination, onSubmit, onCancel }) {
  const [values, setValues] = useState({
    code: destination?.code || '',
    name: destination?.name || '',
    countryCode: destination?.countryCode || '',
    region: destination?.region || '',
    currencyCode: destination?.currencyCode || 'AUD',
    maxAltitudeMetres: destination?.maxAltitudeMetres ?? '',
    advisoryNotes: destination?.advisoryNotes || '',
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (key) => (event) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));
  const fieldError = (name) => error?.details?.[name];

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      code: values.code.trim().toUpperCase(),
      name: values.name.trim(),
      countryCode: values.countryCode.trim().toUpperCase() || null,
      region: values.region.trim() || null,
      currencyCode: values.currencyCode.trim().toUpperCase() || 'AUD',
      maxAltitudeMetres:
        values.maxAltitudeMetres === '' ? null : Number(values.maxAltitudeMetres),
      advisoryNotes: values.advisoryNotes.trim() || null,
    };

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
          label="Code"
          required
          value={values.code}
          onChange={set('code')}
          error={fieldError('code')}
          placeholder="NP"
          maxLength={10}
          hint="Short internal code. Not always ISO — Tibet has none."
          autoFocus
        />
        <TextField
          label="Name"
          required
          value={values.name}
          onChange={set('name')}
          error={fieldError('name')}
          placeholder="Nepal"
        />
      </FieldGrid>

      <FieldGrid columns={3}>
        <TextField
          label="Country code"
          maxLength={2}
          value={values.countryCode}
          onChange={set('countryCode')}
          error={fieldError('countryCode')}
          placeholder="NP"
        />
        <TextField
          label="Region"
          value={values.region}
          onChange={set('region')}
          error={fieldError('region')}
          placeholder="Himalaya"
        />
        <TextField
          label="Currency"
          maxLength={3}
          value={values.currencyCode}
          onChange={set('currencyCode')}
          error={fieldError('currencyCode')}
          placeholder="NPR"
        />
      </FieldGrid>

      <TextField
        label="Maximum altitude (m)"
        type="number"
        min="0"
        value={values.maxAltitudeMetres}
        onChange={set('maxAltitudeMetres')}
        error={fieldError('maxAltitudeMetres')}
        hint="Default the insurance altitude check uses when a segment does not set its own."
      />

      <TextArea
        label="Advisory notes"
        rows={4}
        value={values.advisoryNotes}
        onChange={set('advisoryNotes')}
        error={fieldError('advisoryNotes')}
        hint="Known risks and local practice consultants should brief travellers on."
      />

      <div className="form-actions">
        <Button onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={saving}>
          {destination ? 'Save changes' : 'Create destination'}
        </Button>
      </div>
    </form>
  );
}
