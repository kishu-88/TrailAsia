import Badge from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import Card from '../components/common/Card.jsx';
import DataTable from '../components/common/DataTable.jsx';
import ErrorNotice from '../components/common/ErrorNotice.jsx';
import Pagination from '../components/common/Pagination.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import { SelectField, TextField } from '../components/common/Field.jsx';
import { useList } from '../hooks/useList.js';
import * as emailLogsService from '../services/emailLogs.service.js';
import { formatDateTime } from '../utils/format.js';

const STATUS_TONE = {
  sent: 'success',
  failed: 'danger',
  skipped: 'neutral',
};

const STATUS_LABEL = {
  sent: 'Sent',
  failed: 'Failed',
  skipped: 'Skipped',
};

/**
 * Every email send attempt — Mailgun or otherwise — read-only.
 *
 * Administrator-only, same reasoning as /staff: an email address and
 * whatever error Mailgun returned is operational detail, not something
 * every role needs in order to do their job. This exists to answer one
 * question — "did that actually go out" — that used to only be answerable
 * by tailing the server console.
 */
export default function EmailLogsPage() {
  const list = useList(emailLogsService.listEmailLogs, {
    initialFilters: { q: '', status: '', context: '' },
  });

  const columns = [
    {
      key: 'to',
      header: 'To',
      render: (row) => <span className="mono">{row.to}</span>,
    },
    {
      key: 'subject',
      header: 'Subject',
      render: (row) => (
        <div>
          <strong>{row.subject}</strong>
          {row.context && <p className="muted table__sub">{row.context}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '9rem',
      render: (row) => (
        <Badge tone={STATUS_TONE[row.status] || 'neutral'}>
          {STATUS_LABEL[row.status] || row.status}
        </Badge>
      ),
    },
    {
      key: 'error',
      header: 'Detail',
      hideBelow: 'md',
      render: (row) =>
        row.error ? <span className="muted">{row.error}</span> : <span className="muted">—</span>,
    },
    {
      key: 'createdAt',
      header: 'When',
      width: '13rem',
      hideBelow: 'sm',
      render: (row) => formatDateTime(row.createdAt),
    },
  ];

  return (
    <>
      <PageHeader
        title="Email log"
        subtitle="Every send attempt — through Mailgun or logged instead, when it isn't configured."
      />

      <Card padded={false}>
        <div className="filter-bar">
          <TextField
            label="Search"
            placeholder="Recipient or subject"
            value={list.filters.q}
            onChange={(event) => list.setFilter('q', event.target.value)}
          />
          <SelectField
            label="Status"
            value={list.filters.status}
            onChange={(event) => list.setFilter('status', event.target.value)}
            placeholder="Any status"
            options={[
              { value: 'sent', label: 'Sent' },
              { value: 'failed', label: 'Failed' },
              { value: 'skipped', label: 'Skipped' },
            ]}
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
            emptyTitle="No email sent yet"
            emptyMessage="Notifications, SOS escalations and portal invites will show up here as they go out."
          />
        )}

        <div className="card__body card__body--tight">
          <Pagination meta={list.meta} page={list.page} onPageChange={list.setPage} />
        </div>
      </Card>
    </>
  );
}
