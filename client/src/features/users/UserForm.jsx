import { useState } from 'react';

import Button from '../../components/common/Button.jsx';
import ErrorNotice from '../../components/common/ErrorNotice.jsx';
import { FieldGrid, SelectField, TextField } from '../../components/common/Field.jsx';
import { ROLE_LABELS } from '../../utils/format.js';

const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

/**
 * Create or edit a staff account.
 *
 * A password is only set at creation. Changing one afterwards goes through the
 * reset action, which also revokes that user's sessions — a password change and
 * a profile edit are different events and should not share a form.
 */
export default function UserForm({ user, onSubmit, onCancel }) {
  const editing = Boolean(user);

  const [values, setValues] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    role: user?.role || 'consultant',
    password: '',
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

    const payload = editing
      ? {
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          email: values.email.trim().toLowerCase(),
          role: values.role,
        }
      : {
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          email: values.email.trim().toLowerCase(),
          role: values.role,
          password: values.password,
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

      <TextField
        label="Email"
        type="email"
        required
        value={values.email}
        onChange={set('email')}
        error={fieldError('email')}
        autoComplete="off"
      />

      <SelectField
        label="Role"
        required
        value={values.role}
        onChange={set('role')}
        error={fieldError('role')}
        options={ROLE_OPTIONS}
        hint="Coordinators verify documents; finance is read-only; admins manage accounts."
      />

      {!editing && (
        <TextField
          label="Initial password"
          type="password"
          required
          value={values.password}
          onChange={set('password')}
          error={fieldError('password')}
          autoComplete="new-password"
          hint="At least 12 characters. Ask them to change it after signing in."
        />
      )}

      <div className="form-actions">
        <Button onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={saving}>
          {editing ? 'Save changes' : 'Create account'}
        </Button>
      </div>
    </form>
  );
}
