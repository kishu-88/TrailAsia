import { Link } from 'react-router-dom';

import Badge from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import Card from '../components/common/Card.jsx';
import DataTable from '../components/common/DataTable.jsx';
import ErrorNotice from '../components/common/ErrorNotice.jsx';
import Pagination from '../components/common/Pagination.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import { SelectField } from '../components/common/Field.jsx';
import { SOS_EVENT_LABEL, SOS_EVENT_TONE, sosActorName } from '../features/safety/sosEvents.js';
import { useList } from '../hooks/useList.js';
import { listSosEvents } from '../services/safety.service.js';
import { formatDateTime } from '../utils/format.js';

const TYPE_OPTIONS = Object.entries(SOS_EVENT_LABEL).map(([value, label]) => ({ value, label }));

/**
 * Every SOS event, across every alert, newest first.
 *
 * The safety desk shows what is open and what to do about it. This is the
 * other question — what happened, in what order, and who did it — and it is
 * the screen an incident review reads. Nothing here can be edited: entries
 * are written by the actions that cause them and never changed afterwards.
 *
 * Readable by every staff role, the same as the alerts themselves.
 */
export default function SosLogPage() {
  const list = useList(listSosEvents, { initialFilters: { type: '' } });

  const columns = [
    {
      key: 'createdAt',
      header: 'When',
      width: '13rem',
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: 'traveller',
      header: 'Alert',
      render: (row) => (
        <div>
          <strong>{row.alert?.traveller?.fullName || 'Traveller'}</strong>
          {row.alert?.booking && (
            <p className="muted table__sub">
              <Link to={`/bookings/${row.alert.booking.id}`}>{row.alert.booking.reference}</Link>
              {' · '}
              {row.alert.booking.title}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Event',
      width: '9rem',
      render: (row) => (
        <Badge tone={SOS_EVENT_TONE[row.type] || 'neutral'}>
          {SOS_EVENT_LABEL[row.type] || row.type}
        </Badge>
      ),
    },
    {
      key: 'actor',
      header: 'By',
      width: '12rem',
      render: (row) =>
        row.actor?.kind === 'system' ? (
          <span className="muted">Automatically</span>
        ) : (
          <>
            {sosActorName(row)}
            {row.actor?.kind === 'traveller' && <p className="muted table__sub">Traveller</p>}
          </>
        ),
    },
    {
      key: 'detail',
      header: 'Detail',
      hideBelow: 'md',
      render: (row) => row.detail || <span className="muted">—</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="SOS log"
        subtitle="Everything that has happened to every alert. Entries are never edited or removed."
        actions={
          <Button to="/safety" size="small">
            Back to the safety desk
          </Button>
        }
      />

      <Card padded={false}>
        <div className="filter-bar">
          <SelectField
            label="Event"
            value={list.filters.type}
            onChange={(event) => list.setFilter('type', event.target.value)}
            placeholder="Every event"
            options={TYPE_OPTIONS}
          />
          {list.hasActiveFilters && (
            <div className="filter-bar__reset">
              <Button size="small" onClick={list.resetFilters}>
                Clear
              </Button>
            </div>
          )}
        </div>

        {list.error ? (
          <div className="card__body">
            <ErrorNotice error={list.error} onRetry={list.reload} />
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={list.items}
            loading={list.loading}
            emptyTitle="Nothing logged"
            emptyMessage={
              list.hasActiveFilters
                ? 'No event of that kind has been recorded.'
                : 'No traveller has raised an SOS yet.'
            }
          />
        )}

        <div className="card__body card__body--tight">
          <Pagination meta={list.meta} page={list.page} onPageChange={list.setPage} />
        </div>
      </Card>
    </>
  );
}
