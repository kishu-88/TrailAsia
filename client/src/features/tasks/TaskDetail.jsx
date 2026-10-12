import { useState } from 'react';
import { Link } from 'react-router-dom';

import Badge from '../../components/common/Badge.jsx';
import Button from '../../components/common/Button.jsx';
import { SelectField, TextArea } from '../../components/common/Field.jsx';
import ErrorNotice from '../../components/common/ErrorNotice.jsx';
import { formatDate, formatDateTime } from '../../utils/format.js';
import {
  TASK_CATEGORY_LABELS,
  TASK_STATUS_LABELS,
  describeEvent,
  dueLabel,
  taskPriorityTone,
  taskStatusTone,
} from './taskLabels.js';

/**
 * One task, everything about it, and everything you can do to it.
 *
 * The event trail is the half worth defending. A task list without one answers
 * "what is outstanding" and nothing else; with one it answers "who was on this,
 * what did they try, and when did it change hands" — which is the question
 * actually being asked when somebody is away and their bookings go quiet.
 */
export default function TaskDetail({
  task,
  assignableUsers = [],
  currentUser,
  canEdit,
  onAssign,
  onStatus,
  onNote,
  onEdit,
}) {
  const [note, setNote] = useState('');
  const [blockedReason, setBlockedReason] = useState('');
  const [pendingStatus, setPendingStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const due = dueLabel(task);
  const mine = task.assignee && currentUser && String(task.assignee.id) === String(currentUser.id);

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  function requestStatus(status) {
    if (status === 'blocked') {
      setPendingStatus('blocked');
      return;
    }
    run(() => onStatus({ status }));
  }

  return (
    <div className="task-detail">
      {error && <ErrorNotice error={error} />}

      <div className="task-detail__meta">
        <Badge tone={taskStatusTone(task.status)}>{TASK_STATUS_LABELS[task.status]}</Badge>
        {task.priority !== 'normal' && (
          <Badge tone={taskPriorityTone(task.priority)}>
            {task.priority === 'urgent' ? 'Urgent' : 'High priority'}
          </Badge>
        )}
        <Badge tone="neutral">{TASK_CATEGORY_LABELS[task.category]}</Badge>
        {task.source === 'readiness' && <Badge tone="info">Automatic</Badge>}
      </div>

      {task.description && <p className="preserve-lines">{task.description}</p>}

      {task.status === 'blocked' && task.blockedReason && (
        <div className="alert alert--warning">
          <strong>Blocked:</strong> {task.blockedReason}
        </div>
      )}

      <dl className="detail-list">
        <div className="detail-list__row">
          <dt>Booking</dt>
          <dd>
            {task.booking ? (
              <Link to={`/bookings/${task.booking.id}`}>
                {task.booking.reference} · {task.booking.title}
              </Link>
            ) : (
              '—'
            )}
          </dd>
        </div>
        {task.traveller && (
          <div className="detail-list__row">
            <dt>Traveller</dt>
            <dd>
              <Link to={`/travellers/${task.traveller.id}`}>{task.traveller.fullName}</Link>
            </dd>
          </div>
        )}
        <div className="detail-list__row">
          <dt>Due</dt>
          <dd>
            {task.dueOn ? (
              <>
                {formatDate(task.dueOn)}
                {due.relative && (
                  <>
                    {' '}
                    <span className={due.tone === 'muted' ? 'muted' : `text-${due.tone}`}>
                      ({due.text})
                    </span>
                  </>
                )}
              </>
            ) : (
              'No date set'
            )}
          </dd>
        </div>
        <div className="detail-list__row">
          <dt>Owner</dt>
          <dd>{task.assignee ? task.assignee.fullName : 'Nobody yet'}</dd>
        </div>
        {task.completedAt && (
          <div className="detail-list__row">
            <dt>Closed</dt>
            <dd>
              {formatDateTime(task.completedAt)}
              {task.completedBy ? ` by ${task.completedBy.fullName}` : ' automatically'}
            </dd>
          </div>
        )}
      </dl>

      {canEdit && task.isOpen && (
        <>
          <h3 className="form-section">Move it on</h3>

          <div className="button-group">
            {!mine && (
              <Button
                size="small"
                variant="primary"
                disabled={busy}
                onClick={() => run(() => onAssign(currentUser.id))}
              >
                Take it
              </Button>
            )}
            {task.assignee && (
              <Button size="small" disabled={busy} onClick={() => run(() => onAssign(null))}>
                Put it back
              </Button>
            )}
            {task.allowedNextStatuses.map((status) => (
              <Button
                key={status}
                size="small"
                variant={status === 'done' ? 'primary' : 'secondary'}
                disabled={busy}
                onClick={() => requestStatus(status)}
              >
                {status === 'done' ? 'Mark done' : TASK_STATUS_LABELS[status]}
              </Button>
            ))}
            <Button size="small" disabled={busy} onClick={onEdit}>
              Edit
            </Button>
          </div>

          {pendingStatus === 'blocked' && (
            <div className="task-detail__inline-form">
              <TextArea
                label="What is it blocked on?"
                rows={2}
                value={blockedReason}
                onChange={(event) => setBlockedReason(event.target.value)}
                hint="Blocked with no reason is indistinguishable from abandoned."
              />
              <div className="button-group">
                <Button size="small" onClick={() => setPendingStatus(null)} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  size="small"
                  variant="primary"
                  disabled={busy || blockedReason.trim().length === 0}
                  onClick={() =>
                    run(async () => {
                      await onStatus({ status: 'blocked', blockedReason: blockedReason.trim() });
                      setPendingStatus(null);
                      setBlockedReason('');
                    })
                  }
                >
                  Block it
                </Button>
              </div>
            </div>
          )}

          {assignableUsers.length > 0 && (
            <SelectField
              label="Hand it to somebody else"
              placeholder="Choose a person"
              options={assignableUsers.map((user) => ({ value: user.id, label: user.fullName }))}
              value=""
              disabled={busy}
              onChange={(event) => {
                if (event.target.value) run(() => onAssign(event.target.value));
              }}
            />
          )}
        </>
      )}

      <h3 className="form-section">History</h3>

      <ol className="task-trail">
        {(task.events || []).map((event) => (
          <li key={event.id} className={`task-trail__item task-trail__item--${event.type}`}>
            <p className="task-trail__line">
              <strong>{event.actor ? event.actor.fullName : 'The platform'}</strong>{' '}
              {describeEvent(event)}
              <span className="task-trail__when">{formatDateTime(event.createdAt)}</span>
            </p>
            {event.note && <p className="task-trail__note">{event.note}</p>}
          </li>
        ))}
      </ol>

      {canEdit && (
        <div className="task-detail__inline-form">
          <TextArea
            label="Add a note"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Rang the operator, waiting on confirmation…"
          />
          <div className="button-group">
            <Button
              size="small"
              variant="primary"
              disabled={busy || note.trim().length === 0}
              onClick={() =>
                run(async () => {
                  await onNote(note.trim());
                  setNote('');
                })
              }
            >
              Save note
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
