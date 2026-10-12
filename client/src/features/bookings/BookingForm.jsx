import { useState } from 'react';

import Button from '../../components/common/Button.jsx';
import {
  FieldGrid,
  SelectField,
  TextArea,
  TextField,
} from '../../components/common/Field.jsx';
import ErrorNotice from '../../components/common/ErrorNotice.jsx';

const CURRENCIES = ['AUD', 'NPR', 'BTN', 'INR', 'USD', 'CNY', 'VND', 'IDR', 'THB'];

/**
 * Create or edit a booking.
 *
 * Field-level errors come straight from the API's `details` object, keyed by
 * field name, so a rejected `returnDate` is shown under the return date rather
 * than as a banner the user has to map back onto the form themselves.
 */
export default function BookingForm({ booking, staff = [], onSubmit, onCancel }) {
  const editing = Boolean(booking);

  const [values, setValues] = useState({
    title: booking?.title || '',
    coordinatorId: booking?.coordinatorId || '',
    departureDate: booking?.departureDate || '',
    returnDate: booking?.returnDate || '',
    partySize: booking?.partySize ?? 1,
    currencyCode: booking?.currencyCode || 'AUD',
    totalAmount: booking?.totalAmount || '',
    depositAmount: booking?.depositAmount || '',
    notes: booking?.notes || '',
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

    // Empty strings mean "not set", which the API expects as null. Numbers have
    // to be numbers — the schema is strict about types rather than coercing.
    const payload = {
      title: values.title.trim(),
      coordinatorId: values.coordinatorId || null,
      departureDate: values.departureDate || null,
      returnDate: values.returnDate || null,
      partySize: Number(values.partySize) || 1,
      currencyCode: values.currencyCode,
      totalAmount: values.totalAmount === '' ? null : values.totalAmount,
      depositAmount: values.depositAmount === '' ? null : values.depositAmount,
      notes: values.notes.trim() || null,
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

      <TextField
        label="Title"
        required
        value={values.title}
        onChange={set('title')}
        error={fieldError('title')}
        placeholder="Everest Base Camp trek — March departure"
        autoFocus
      />

      <FieldGrid>
        <TextField
          label="Departure"
          type="date"
          value={values.departureDate}
          onChange={set('departureDate')}
          error={fieldError('departureDate')}
        />
        <TextField
          label="Return"
          type="date"
          value={values.returnDate}
          onChange={set('returnDate')}
          error={fieldError('returnDate')}
        />
      </FieldGrid>

      <FieldGrid>
        <TextField
          label="Party size"
          type="number"
          min="1"
          value={values.partySize}
          onChange={set('partySize')}
          error={fieldError('partySize')}
        />
        <SelectField
          label="Coordinator"
          value={values.coordinatorId}
          onChange={set('coordinatorId')}
          error={fieldError('coordinatorId')}
          placeholder="Not assigned"
          options={staff.map((member) => ({
            value: member.id,
            label: `${member.fullName} · ${member.role}`,
          }))}
        />
      </FieldGrid>

      <FieldGrid columns={3}>
        <SelectField
          label="Currency"
          value={values.currencyCode}
          onChange={set('currencyCode')}
          error={fieldError('currencyCode')}
          options={CURRENCIES}
        />
        <TextField
          label="Total"
          inputMode="decimal"
          placeholder="8450.00"
          value={values.totalAmount}
          onChange={set('totalAmount')}
          error={fieldError('totalAmount')}
        />
        <TextField
          label="Deposit"
          inputMode="decimal"
          placeholder="1500.00"
          value={values.depositAmount}
          onChange={set('depositAmount')}
          error={fieldError('depositAmount')}
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
          {editing ? 'Save changes' : 'Create booking'}
        </Button>
      </div>
    </form>
  );
}
