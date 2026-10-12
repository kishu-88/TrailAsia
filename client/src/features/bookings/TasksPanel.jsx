import { useCallback, useEffect, useState } from 'react';

import Badge from '../../components/common/Badge.jsx';
import Button from '../../components/common/Button.jsx';
import Card from '../../components/common/Card.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import ErrorNotice from '../../components/common/ErrorNotice.jsx';
import Modal from '../../components/common/Modal.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import TaskDetail from '../tasks/TaskDetail.jsx';
import TaskForm from '../tasks/TaskForm.jsx';
import {
  TASK_STATUS_LABELS,
  dueLabel,
  taskPriorityTone,
  taskStatusTone,
} from '../tasks/taskLabels.js';
import {
  addTaskNote,
  assignTask,
  createTask,
  getTask,
  listTasks,
  setTaskStatus,
  syncTasksFromReadiness,
  updateTask,
} from '../../services/tasks.service.js';
import { listUsers } from '../../services/users.service.js';

/**
 * This booking's work, on the booking.
 *
 * "Generate from documents" is the button worth explaining. The checklist
 * already knows which visa is missing and when it is due; making somebody read
 * that, then type it into a task list, is asking a person to do a computer's job
 * badly. Pressing it twice is safe — the generator is keyed on the gap, not the
 * run, so it updates rather than duplicating.
 */
export default function TasksPanel({ booking, canEdit, onChanged }) {
  const { user } = useAuth();
  const toast = useToast();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showClosed, setShowClosed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [assignable, setAssignable] = useState([]);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listTasks({
        bookingId: booking.id,
        status: showClosed ? 'all' : 'open',
        perPage: 100,
      });
      setTasks(response.data || []);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [booking.id, showClosed]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!canEdit) return;
    listUsers({ isActive: 'true', perPage: 100 })
      .then((response) =>
        setAssignable(
          (response.data || []).filter((row) =>
            ['consultant', 'coordinator', 'admin'].includes(row.role)
          )
        )
      )
      .catch(() => setAssignable([]));
  }, [canEdit]);

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await syncTasksFromReadiness(booking.id);
      const parts = [];
      if (result.created) parts.push(`${result.created} raised`);
      if (result.reopened) parts.push(`${result.reopened} reopened`);
      if (result.updated) parts.push(`${result.updated} updated`);
      if (result.closed) parts.push(`${result.closed} closed`);
      toast.success(parts.length > 0 ? parts.join(', ') + '.' : 'Nothing to change.');
      await load();
      onChanged?.();
    } catch (caught) {
      toast.error(
        caught.code === 'NO_ITINERARY'
          ? 'Add an itinerary first — document requirements come from the destinations visited.'
          : caught.message
      );
    } finally {
      setSyncing(false);
    }
  }

  const open = tasks.filter((task) => task.isOpen);
  const overdue = open.filter((task) => task.overdue);

  return (
    <>
      <Card
        title="Tasks"
        subtitle={
          open.length === 0
            ? 'Nothing outstanding on this booking.'
            : `${open.length} open${overdue.length > 0 ? `, ${overdue.length} overdue` : ''}`
        }
        actions={
          canEdit && (
            <div className="button-group">
              <Button size="small" onClick={handleSync} loading={syncing}>
                Generate from documents
              </Button>
              <Button size="small" variant="primary" onClick={() => setCreating(true)}>
                Add task
              </Button>
            </div>
          )
        }
      >
        {error && <ErrorNotice error={error} onRetry={load} />}
        {loading && <Spinner block label="Loading tasks…" />}

        {!loading && tasks.length === 0 && (
          <EmptyState
            title="No tasks yet"
            message="Add one by hand, or generate them from the documents this trip still needs."
          />
        )}

        {!loading && tasks.length > 0 && (
          <ul className="task-list">
            {tasks.map((task) => {
              const due = dueLabel(task);
              return (
                <li key={task.id} className="task-list__item">
                  <button
                    type="button"
                    className="task-list__button"
                    onClick={async () => setSelected(await getTask(task.id))}
                  >
                    <span className="task-list__main">
                      <span className="task-list__title">{task.title}</span>
                      <span className="task-list__meta">
                        {task.assignee ? task.assignee.fullName : 'Nobody yet'}
                        {task.traveller ? ` · ${task.traveller.fullName}` : ''}
                        {task.source === 'readiness' ? ' · automatic' : ''}
                      </span>
                    </span>
                    <span className="task-list__side">
                      <span className={due.tone === 'muted' ? 'muted' : `text-${due.tone}`}>
                        {due.text}
                      </span>
                      {task.priority === 'urgent' || task.priority === 'high' ? (
                        <Badge tone={taskPriorityTone(task.priority)}>
                          {task.priority === 'urgent' ? 'Urgent' : 'High'}
                        </Badge>
                      ) : null}
                      <Badge tone={taskStatusTone(task.status)}>
                        {TASK_STATUS_LABELS[task.status]}
                      </Badge>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="button-group" style={{ marginTop: 'var(--space-4)' }}>
          <Button size="small" onClick={() => setShowClosed((current) => !current)}>
            {showClosed ? 'Hide finished' : 'Show finished'}
          </Button>
        </div>
      </Card>

      <Modal
        open={creating}
        title="Add a task"
        description={`On ${booking.reference} — ${booking.title}`}
        onClose={() => setCreating(false)}
        size="medium"
      >
        <TaskForm
          bookingId={booking.id}
          travellers={booking.travellers || []}
          assignableUsers={assignable}
          onCancel={() => setCreating(false)}
          onSubmit={async (payload) => {
            await createTask(payload);
            setCreating(false);
            await load();
            onChanged?.();
            toast.success('Task added.');
          }}
        />
      </Modal>

      <Modal
        open={Boolean(selected) && !editing}
        title={selected?.title || 'Task'}
        onClose={() => setSelected(null)}
        size="medium"
      >
        {selected && (
          <TaskDetail
            task={selected}
            currentUser={user}
            canEdit={canEdit}
            assignableUsers={assignable.filter(
              (row) => String(row.id) !== String(selected.assignee?.id)
            )}
            onAssign={async (userId) => {
              await assignTask(selected.id, userId ? String(userId) : null);
              setSelected(await getTask(selected.id));
              await load();
            }}
            onStatus={async (payload) => {
              await setTaskStatus(selected.id, payload);
              setSelected(await getTask(selected.id));
              await load();
              onChanged?.();
            }}
            onNote={async (note) => {
              setSelected(await addTaskNote(selected.id, note));
            }}
            onEdit={() => setEditing(true)}
          />
        )}
      </Modal>

      <Modal
        open={Boolean(selected) && editing}
        title="Edit task"
        onClose={() => setEditing(false)}
        size="medium"
      >
        {selected && (
          <TaskForm
            task={selected}
            travellers={booking.travellers || []}
            onCancel={() => setEditing(false)}
            onSubmit={async (payload) => {
              await updateTask(selected.id, payload);
              setEditing(false);
              setSelected(await getTask(selected.id));
              await load();
              toast.success('Task updated.');
            }}
          />
        )}
      </Modal>
    </>
  );
}
