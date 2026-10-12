import { useEffect, useState } from 'react';

import Badge from '../../components/common/Badge.jsx';
import Button from '../../components/common/Button.jsx';
import ErrorNotice from '../../components/common/ErrorNotice.jsx';
import { SelectField, TextArea } from '../../components/common/Field.jsx';
import Modal from '../../components/common/Modal.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { getWorkload, handoverTasks } from '../../services/tasks.service.js';
import { formatDate } from '../../utils/format.js';
import { dueLabel } from './taskLabels.js';

/**
 * Move one person's open work to another.
 *
 * The preview is the point. Bulk reassignment without showing what is about to
 * move is a button nobody presses twice, and "Kishor is on leave, Vishal has his
 * bookings" is currently said out loud precisely because the alternative — going
 * through tasks one at a time — is work nobody does. Showing the list first
 * makes the fast path the safe one.
 *
 * Closed tasks are never included, and the dialog says so: rewriting who
 * finished something last month would be a lie in a record other people rely on.
 */
export default function HandoverModal({ open, users = [], onClose, onDone }) {
  const [fromUserId, setFromUserId] = useState('');
  const [toUserId, setToUserId] = useState('');
  const [note, setNote] = useState('');
  const [workload, setWorkload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      setFromUserId('');
      setToUserId('');
      setNote('');
      setWorkload(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    if (!fromUserId) {
      setWorkload(null);
      return undefined;
    }
    setLoading(true);
    getWorkload(fromUserId)
      .then((data) => {
        if (!cancelled) setWorkload(data);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromUserId]);

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      const result = await handoverTasks({
        fromUserId,
        toUserId,
        note: note.trim() || undefined,
      });
      onDone(result);
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  const options = users.map((user) => ({ value: user.id, label: user.fullName }));
  const ready = fromUserId && toUserId && fromUserId !== toUserId && workload?.total > 0;

  return (
    <Modal
      open={open}
      title="Hand work over"
      description="Moves every open task from one person to another, in one go."
      onClose={onClose}
      size="medium"
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleConfirm} loading={saving} disabled={!ready}>
            {workload?.total
              ? `Move ${workload.total} task${workload.total === 1 ? '' : 's'}`
              : 'Move tasks'}
          </Button>
        </>
      }
    >
      {error && <ErrorNotice error={error} />}

      <SelectField
        label="Who is handing over"
        placeholder="Choose a person"
        options={options}
        value={fromUserId}
        onChange={(event) => setFromUserId(event.target.value)}
      />

      <SelectField
        label="Who is taking it on"
        placeholder="Choose a person"
        options={options.filter((option) => option.value !== fromUserId)}
        value={toUserId}
        onChange={(event) => setToUserId(event.target.value)}
      />

      <TextArea
        label="Why"
        rows={2}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="On leave until the 30th."
        hint="Recorded against every task that moves, so the reason survives the conversation."
      />

      {loading && <Spinner block label="Checking what they are carrying…" />}

      {workload && !loading && (
        <div className="handover-preview">
          <p className="handover-preview__summary">
            <strong>{workload.user.fullName}</strong> has {workload.total} open task
            {workload.total === 1 ? '' : 's'} across {workload.bookings} booking
            {workload.bookings === 1 ? '' : 's'}
            {workload.overdue > 0 && (
              <>
                {' '}
                <Badge tone="danger">{workload.overdue} overdue</Badge>
              </>
            )}
            .
          </p>

          {workload.total === 0 ? (
            <p className="muted">Nothing to move.</p>
          ) : (
            <ul className="handover-preview__list">
              {workload.tasks.map((task) => {
                const due = dueLabel(task);
                return (
                  <li key={task.id}>
                    <span className="handover-preview__title">{task.title}</span>
                    <span className="muted">
                      {task.booking?.reference}
                      {task.dueOn ? ` · ${formatDate(task.dueOn)} (${due.text})` : ' · no date'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="muted small">
            Finished and cancelled tasks stay where they are — a handover is about work still
            to do.
          </p>
        </div>
      )}
    </Modal>
  );
}
