import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Badge from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import DataTable from '../components/common/DataTable.jsx';
import ErrorNotice from '../components/common/ErrorNotice.jsx';
import Modal from '../components/common/Modal.jsx';
import Pagination from '../components/common/Pagination.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import HandoverModal from '../features/tasks/HandoverModal.jsx';
import TaskDetail from '../features/tasks/TaskDetail.jsx';
import TaskForm from '../features/tasks/TaskForm.jsx';
import {
  TASK_CATEGORY_LABELS,
  TASK_STATUS_LABELS,
  dueLabel,
  taskPriorityTone,
  taskStatusTone,
} from '../features/tasks/taskLabels.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useList } from '../hooks/useList.js';
import {
  addTaskNote,
  assignTask,
  getTask,
  getTaskSummary,
  listTasks,
  setTaskStatus,
  updateTask,
} from '../services/tasks.service.js';
import { listUsers } from '../services/users.service.js';
import { can } from '../utils/permissions.js';

/**
 * The shared work queue.
 *
 * The four views along the top are the four questions people actually ask, in
 * the order they ask them: what is mine, what is late, what has nobody picked
 * up, and what is everything. "Unassigned" earns its place next to "mine"
 * because work with no owner is the failure a shared queue exists to expose, and
 * it is invisible on a screen that only ever shows you your own list.
 */
const VIEWS = [
  { key: 'mine', label: 'Mine', filters: { assignedTo: 'me', status: 'open', overdue: '' } },
  { key: 'overdue', label: 'Overdue', filters: { assignedTo: '', status: 'open', overdue: 'true' } },
  {
    key: 'unassigned',
    label: 'Unassigned',
    filters: { assignedTo: 'unassigned', status: 'open', overdue: '' },
  },
  { key: 'all', label: 'Everything open', filters: { assignedTo: '', status: 'open', overdue: '' } },
];

export default function TasksPage() {
  const { user } = useAuth();
  const toast = useToast();

  const [view, setView] = useState('mine');
  const [summary, setSummary] = useState(null);
  const [assignable, setAssignable] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [handingOver, setHandingOver] = useState(false);

  const editable = can.editTrips(user);

  const list = useList(listTasks, {
    initialFilters: VIEWS[0].filters,
  });
  const { setFilter, reload } = list;

  const loadSummary = useCallback(() => {
    getTaskSummary().then(setSummary).catch(() => setSummary(null));
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    // Only the roles that can own work are offered as assignees, mirroring the
    // server's ASSIGNABLE_ROLES. Finance reads the queue; it does not carry it.
    listUsers({ isActive: 'true', perPage: 100 })
      .then((response) =>
        setAssignable(
          (response.data || []).filter((row) =>
            ['consultant', 'coordinator', 'admin'].includes(row.role)
          )
        )
      )
      .catch(() => setAssignable([]));
  }, []);

  function switchView(key) {
    const next = VIEWS.find((entry) => entry.key === key);
    setView(key);
    Object.entries(next.filters).forEach(([field, value]) => setFilter(field, value));
  }

  async function openTask(id) {
    try {
      setSelected(await getTask(id));
    } catch (caught) {
      toast.error(caught.message);
    }
  }

  function refreshAll(task) {
    if (task) setSelected(task);
    reload();
    loadSummary();
  }

  const columns = [
    {
      key: 'title',
      header: 'Task',
      render: (task) => (
        <div className="task-cell">
          <span className="task-cell__title">{task.title}</span>
          <span className="task-cell__meta">
            {task.booking ? `${task.booking.reference} · ${task.booking.title}` : ''}
            {task.traveller ? ` · ${task.traveller.fullName}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'due',
      header: 'Due',
      width: '140px',
      render: (task) => {
        const due = dueLabel(task);
        return (
          <span className={due.tone === 'muted' ? 'muted' : `text-${due.tone}`}>{due.text}</span>
        );
      },
    },
    {
      key: 'priority',
      header: 'Priority',
      width: '110px',
      hideBelow: 'md',
      render: (task) =>
        task.priority === 'normal' || task.priority === 'low' ? (
          <span className="muted">{task.priority === 'low' ? 'Low' : 'Normal'}</span>
        ) : (
          <Badge tone={taskPriorityTone(task.priority)}>
            {task.priority === 'urgent' ? 'Urgent' : 'High'}
          </Badge>
        ),
    },
    {
      key: 'category',
      header: 'Type',
      width: '130px',
      hideBelow: 'lg',
      render: (task) => <span className="muted">{TASK_CATEGORY_LABELS[task.category]}</span>,
    },
    {
      key: 'assignee',
      header: 'Owner',
      width: '160px',
      render: (task) =>
        task.assignee ? (
          task.assignee.fullName
        ) : (
          <span className="muted">Nobody yet</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      render: (task) => (
        <Badge tone={taskStatusTone(task.status)}>{TASK_STATUS_LABELS[task.status]}</Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle="Everything outstanding across every booking, in one queue."
        meta={
          summary && (
            <div className="header-stats">
              <span className="header-stats__item">
                <strong>{summary.mine}</strong> mine
              </span>
              <span className="header-stats__item">
                <strong>{summary.mineDueToday}</strong> due today
              </span>
              <span className={`header-stats__item${summary.overdue ? ' header-stats__item--alert' : ''}`}>
                <strong>{summary.overdue}</strong> overdue
              </span>
              <span
                className={`header-stats__item${summary.unassigned ? ' header-stats__item--alert' : ''}`}
              >
                <strong>{summary.unassigned}</strong> unassigned
              </span>
            </div>
          )
        }
        actions={
          editable && (
            <div className="button-group">
              <Button onClick={() => setHandingOver(true)}>Hand work over</Button>
            </div>
          )
        }
      />

      <div className="button-group" style={{ marginBottom: 'var(--space-4)' }}>
        {VIEWS.map((entry) => (
          <Button
            key={entry.key}
            size="small"
            variant={view === entry.key ? 'primary' : 'secondary'}
            onClick={() => switchView(entry.key)}
          >
            {entry.label}
            {entry.key === 'unassigned' && summary?.unassigned ? ` (${summary.unassigned})` : ''}
            {entry.key === 'overdue' && summary?.overdue ? ` (${summary.overdue})` : ''}
          </Button>
        ))}
      </div>

      {list.error && <ErrorNotice error={list.error} onRetry={list.reload} />}

      <DataTable
        columns={columns}
        rows={list.items}
        loading={list.loading}
        onRowClick={(task) => openTask(task.id)}
        emptyTitle={
          view === 'mine'
            ? 'Nothing assigned to you'
            : view === 'overdue'
              ? 'Nothing is late'
              : view === 'unassigned'
                ? 'Everything has an owner'
                : 'No open tasks'
        }
        emptyMessage={
          view === 'unassigned'
            ? 'Every open task has somebody responsible for it.'
            : 'Tasks are raised from a booking, or generated from its outstanding documents.'
        }
        emptyAction={<Button to="/bookings">Go to bookings</Button>}
      />

      <Pagination meta={list.meta} page={list.page} onPageChange={list.setPage} />

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
            canEdit={editable}
            assignableUsers={assignable.filter(
              (row) => String(row.id) !== String(selected.assignee?.id)
            )}
            onAssign={async (userId) => {
              const updated = await assignTask(selected.id, userId ? String(userId) : null);
              refreshAll(await getTask(updated.id));
              toast.success(userId ? 'Reassigned.' : 'Back in the unassigned queue.');
            }}
            onStatus={async (payload) => {
              await setTaskStatus(selected.id, payload);
              refreshAll(await getTask(selected.id));
              toast.success(`Moved to ${TASK_STATUS_LABELS[payload.status].toLowerCase()}.`);
            }}
            onNote={async (note) => {
              const updated = await addTaskNote(selected.id, note);
              refreshAll(updated);
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
            travellers={[]}
            onCancel={() => setEditing(false)}
            onSubmit={async (payload) => {
              await updateTask(selected.id, payload);
              setEditing(false);
              refreshAll(await getTask(selected.id));
              toast.success('Task updated.');
            }}
          />
        )}
      </Modal>

      <HandoverModal
        open={handingOver}
        users={assignable}
        onClose={() => setHandingOver(false)}
        onDone={(result) => {
          setHandingOver(false);
          reload();
          loadSummary();
          toast.success(
            result.moved === 0
              ? `${result.from.fullName} had no open work to hand over.`
              : `${result.moved} task${result.moved === 1 ? '' : 's'} moved to ${result.to.fullName}.`
          );
        }}
      />

      <p className="muted small" style={{ marginTop: 'var(--space-5)' }}>
        Tasks marked <Badge tone="info">Automatic</Badge> come from a booking&rsquo;s document
        checklist and close themselves when the document arrives. Raise one by hand from the{' '}
        <Link to="/bookings">booking</Link> it belongs to.
      </p>
    </>
  );
}
