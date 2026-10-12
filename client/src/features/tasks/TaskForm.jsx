import { useState } from 'react';

import Button from '../../components/common/Button.jsx';
import ErrorNotice from '../../components/common/ErrorNotice.jsx';
import {
  FieldGrid,
  SelectField,
  TextArea,
  TextField,
} from '../../components/common/Field.jsx';
import { TASK_CATEGORY_LABELS, TASK_PRIORITY_LABELS } from './taskLabels.js';

const CATEGORY_OPTIONS = Object.entries(TASK_CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));
const PRIORITY_OPTIONS = Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/**
 * Raise or edit a task.
 *
 * Only the title is required. Work written down without a date, an owner or a
 * category is still worth more than the same thing remembered by one person, and
 * demanding five fields before anything can be captured is how a shared queue
 * ends up empty while the work carries on in somebody's inbox.
 */
export default function TaskForm({
  task,
  bookingId,
  travellers = [],
  assignableUsers = [],
  onSubmit,
  onCancel,
}) {
  const editing = Boolean(task);

  const [values, setValues] = useState({
    title: task?.title || '',
    description: task?.description || '',
    category: task?.category || 'other',
    priority: task?.priority || 'normal',
    dueOn: task?.dueOn || '',
    travellerId: task?.travellerId || '',
    assignedToUserId: task?.assignedToUserId || '',
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
      title: values.title.trim(),
      description: values.description.trim() || null,
      category: values.category,
      priority: values.priority,
      dueOn: values.dueOn || null,
      travellerId: values.travellerId || null,
    };
    if (!editing) {
      payload.bookingId = String(bookingId);
      payload.assignedToUserId = values.assignedToUserId || null;
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

      <TextField
        label="What needs doing"
        required
        value={values.title}
        onChange={set('title')}
        error={fieldError('title')}
        autoFocus
      />

      <TextArea
        label="Detail"
        rows={3}
        value={values.description}
        onChange={set('description')}
        error={fieldError('description')}
      />

      <FieldGrid>
        <SelectField
          label="Category"
          options={CATEGORY_OPTIONS}
          value={values.category}
          onChange={set('category')}
        />
        <SelectField
          label="Priority"
          options={PRIORITY_OPTIONS}
          value={values.priority}
          onChange={set('priority')}
        />
        <TextField
          label="Due"
          type="date"
          value={values.dueOn || ''}
          onChange={set('dueOn')}
          error={fieldError('dueOn')}
        />
        {travellers.length > 0 && (
          <SelectField
            label="About which traveller"
            placeholder="The whole booking"
            options={travellers.map((traveller) => ({
              value: traveller.id,
              label: traveller.fullName,
            }))}
            value={values.travellerId}
            onChange={set('travellerId')}
            error={fieldError('travellerId')}
          />
        )}
      </FieldGrid>

      {!editing && (
        <SelectField
          label="Owner"
          hint="Leave it unassigned and it sits in the shared queue for whoever picks it up."
          placeholder="Nobody yet"
          options={assignableUsers.map((user) => ({ value: user.id, label: user.fullName }))}
          value={values.assignedToUserId}
          onChange={set('assignedToUserId')}
          error={fieldError('assignedToUserId')}
        />
      )}

      <div className="modal__footer">
        <Button onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={saving}>
          {editing ? 'Save changes' : 'Add task'}
        </Button>
      </div>
    </form>
  );
}
