import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import Badge from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import Card from '../components/common/Card.jsx';
import DataTable from '../components/common/DataTable.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import ErrorNotice from '../components/common/ErrorNotice.jsx';
import Modal from '../components/common/Modal.jsx';
import Pagination from '../components/common/Pagination.jsx';
import Spinner from '../components/common/Spinner.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import { SelectField, TextField } from '../components/common/Field.jsx';
import OperatorForm from '../features/operators/OperatorForm.jsx';
import {
  CONFIRMATION_STATUS_LABELS,
  OPERATOR_TYPES,
  OPERATOR_TYPE_LABELS,
  confirmationStatusTone,
} from '../features/operators/operatorLabels.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { useList } from '../hooks/useList.js';
import * as operatorsService from '../services/operators.service.js';
import { formatDate, relativeDays } from '../utils/format.js';
import { can } from '../utils/permissions.js';

/**
 * Two things on one screen: who our partners are, and what we are waiting on.
 *
 * The chase list comes first deliberately. The directory is reference data
 * somebody maintains occasionally; the outstanding list is the question a
 * coordinator has every morning, and which today can only be answered by asking
 * each consultant what they are still waiting for.
 */
export default function OperatorsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);

  const summary = useAsync(() => operatorsService.getSummary(), []);

  const outstanding = useAsync(
    () => operatorsService.listOutstanding({ overdueOnly: overdueOnly ? 'true' : '', perPage: 50 }),
    [overdueOnly]
  );

  const directory = useList(operatorsService.listOperators, {
    initialFilters: { q: '', destinationId: '', type: '', vetted: '' },
  });

  const columns = [
    {
      key: 'name',
      header: 'Operator',
      render: (operator) => (
        <div>
          <Link to={`/operators/${operator.id}`} className="link">
            {operator.name}
          </Link>
          {!operator.isVetted && (
            <>
              {' '}
              <Badge tone="warning">Not vetted</Badge>
            </>
          )}
          {!operator.isActive && (
            <>
              {' '}
              <Badge tone="neutral">Retired</Badge>
            </>
          )}
          {operator.contactName && (
            <p className="muted table__sub">{operator.contactName}</p>
          )}
        </div>
      ),
    },
    {
      key: 'destination',
      header: 'Destination',
      width: '9rem',
      render: (operator) => operator.destination?.name || <span className="muted">—</span>,
    },
    {
      key: 'type',
      header: 'Provides',
      width: '9rem',
      hideBelow: 'md',
      render: (operator) => OPERATOR_TYPE_LABELS[operator.type] || operator.type,
    },
    {
      key: 'contact',
      header: 'Contact',
      hideBelow: 'md',
      render: (operator) => (
        <div>
          {operator.contactEmail || <span className="muted">No email</span>}
          {operator.contactPhone && <p className="muted table__sub">{operator.contactPhone}</p>}
        </div>
      ),
    },
    {
      key: 'typicalResponseDays',
      header: 'Turnaround',
      width: '7rem',
      align: 'right',
      hideBelow: 'md',
      render: (operator) => `${operator.typicalResponseDays}d`,
    },
  ];

  async function handleCreate(payload) {
    const operator = await operatorsService.createOperator(payload);
    setCreating(false);
    toast.success('Operator added. Vet them before they can be given work.');
    navigate(`/operators/${operator.id}`);
  }

  const stats = summary.data;

  return (
    <>
      <PageHeader
        title="Ground operators"
        subtitle="The agency's partner network, and what each booking is still waiting on."
        actions={
          can.editReference(user) && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              Add operator
            </Button>
          )
        }
      />

      {stats && (
        <div className="stat-row">
          <Stat label="Awaiting a reply" value={stats.outstanding} />
          <Stat
            label="Past deadline"
            value={stats.overdue}
            tone={stats.overdue > 0 ? 'danger' : undefined}
          />
          <Stat label="Not yet sent" value={stats.notYetRequested} />
          <Stat
            label="Unvetted partners"
            value={stats.unvettedOperators}
            hint={`${stats.activeOperators} active`}
            tone={stats.unvettedOperators > 0 ? 'warning' : undefined}
          />
        </div>
      )}

      <Card
        title="Waiting on an answer"
        actions={
          <Button size="small" onClick={() => setOverdueOnly((value) => !value)}>
            {overdueOnly ? 'Show all' : 'Overdue only'}
          </Button>
        }
        padded={false}
      >
        {outstanding.loading ? (
          <Spinner block label="Loading…" />
        ) : outstanding.error ? (
          <div className="card__body">
            <ErrorNotice error={outstanding.error} onRetry={outstanding.reload} />
          </div>
        ) : (outstanding.data?.data || []).length === 0 ? (
          <EmptyState
            title={overdueOnly ? 'Nothing is overdue' : 'Nothing outstanding'}
            message="Every operator request on an active booking has been answered."
          />
        ) : (
          <ul className="confirmation-list">
            {outstanding.data.data.map((row) => (
              <li key={row.id} className="confirmation">
                <div className="confirmation__body">
                  <div className="confirmation__heading">
                    <strong>{row.summary}</strong>
                    <Badge tone={confirmationStatusTone(row.status)}>
                      {CONFIRMATION_STATUS_LABELS[row.status] || row.status}
                    </Badge>
                    {row.overdue && <Badge tone="danger">Overdue</Badge>}
                  </div>
                  <p className="muted confirmation__meta">
                    {row.operator?.name}
                    {row.booking && (
                      <>
                        {' · '}
                        <Link to={`/bookings/${row.booking.id}`} className="link link--mono">
                          {row.booking.reference}
                        </Link>
                      </>
                    )}
                  </p>
                  <p className="muted confirmation__meta">
                    {row.dueBy
                      ? `Answer needed ${formatDate(row.dueBy)} (${relativeDays(row.dueBy)})`
                      : 'No deadline set'}
                    {row.booking?.departureDate &&
                      ` · departs ${formatDate(row.booking.departureDate)}`}
                  </p>
                </div>
                <div className="confirmation__actions">
                  <Button size="small" to={`/bookings/${row.booking?.id}`}>
                    Open booking
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Directory" padded={false}>
        <div className="filter-bar">
          <TextField
            label="Search"
            placeholder="Name or contact"
            value={directory.filters.q}
            onChange={(event) => directory.setFilter('q', event.target.value)}
          />
          <SelectField
            label="Provides"
            value={directory.filters.type}
            onChange={(event) => directory.setFilter('type', event.target.value)}
            placeholder="Any"
            options={OPERATOR_TYPES.map((type) => ({
              value: type,
              label: OPERATOR_TYPE_LABELS[type],
            }))}
          />
          <SelectField
            label="Vetting"
            value={directory.filters.vetted}
            onChange={(event) => directory.setFilter('vetted', event.target.value)}
            placeholder="All"
            options={[
              { value: 'true', label: 'Vetted' },
              { value: 'false', label: 'Not vetted' },
            ]}
          />
          {directory.hasActiveFilters && (
            <div className="filter-bar__reset">
              <Button size="small" onClick={directory.resetFilters}>
                Clear
              </Button>
            </div>
          )}
        </div>

        {directory.error ? (
          <div className="card__body">
            <ErrorNotice error={directory.error} onRetry={directory.reload} />
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={directory.items}
            loading={directory.loading}
            emptyTitle={
              directory.hasActiveFilters ? 'Nothing matches those filters' : 'No operators yet'
            }
            emptyMessage="Guides, lodges and transfer partners the agency works with."
            emptyAction={
              can.editReference(user) && (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  Add operator
                </Button>
              )
            }
          />
        )}

        <div className="card__body card__body--tight">
          <Pagination
            meta={directory.meta}
            page={directory.page}
            onPageChange={directory.setPage}
          />
        </div>
      </Card>

      <Modal open={creating} title="Add an operator" onClose={() => setCreating(false)}>
        <OperatorForm onSubmit={handleCreate} onCancel={() => setCreating(false)} />
      </Modal>
    </>
  );
}

function Stat({ label, value, hint, tone }) {
  return (
    <div className={`stat${tone ? ` stat--${tone}` : ''}`}>
      <p className="stat__value">{value}</p>
      <p className="stat__label">{label}</p>
      {hint && <p className="muted small">{hint}</p>}
    </div>
  );
}
