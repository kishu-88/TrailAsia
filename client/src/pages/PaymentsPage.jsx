import { useState } from 'react';
import { Link } from 'react-router-dom';

import Badge from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import Card from '../components/common/Card.jsx';
import DataTable from '../components/common/DataTable.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import ErrorNotice from '../components/common/ErrorNotice.jsx';
import Pagination from '../components/common/Pagination.jsx';
import Spinner from '../components/common/Spinner.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import { SelectField, TextField } from '../components/common/Field.jsx';
import {
  DIRECTION_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  paymentStatusTone,
  scheduleLabel,
  scheduleTone,
} from '../features/payments/paymentLabels.js';
import { useAsync } from '../hooks/useAsync.js';
import { useList } from '../hooks/useList.js';
import * as paymentsService from '../services/payments.service.js';
import { formatDate, formatMoney, relativeDays } from '../utils/format.js';

/**
 * The finance desk.
 *
 * Two questions, in the order somebody actually asks them: what money is owed
 * to us, and what has moved. The chase list comes first because it is the one
 * with a deadline attached — the ledger below is a record, and a record can
 * wait until after the phone calls.
 *
 * Nothing on this screen adds amounts across currencies. An agency that quotes
 * in AUD and settles in NPR has two sets of figures, and a combined total would
 * be a number that looks authoritative and means nothing.
 */
export default function PaymentsPage() {
  const [overdueOnly, setOverdueOnly] = useState(false);

  const summary = useAsync(() => paymentsService.getSummary(), []);

  const outstanding = useAsync(
    () =>
      paymentsService.listOutstanding({
        overdueOnly: overdueOnly ? 'true' : '',
        perPage: 50,
      }),
    [overdueOnly]
  );

  const ledger = useList(paymentsService.listPayments, {
    initialFilters: { q: '', direction: '', method: '', status: '' },
  });

  const stats = summary.data;

  const columns = [
    {
      key: 'receivedOn',
      header: 'Date',
      width: '8rem',
      render: (payment) => formatDate(payment.receivedOn),
    },
    {
      key: 'booking',
      header: 'Booking',
      render: (payment) =>
        payment.booking ? (
          <div>
            <Link to={`/bookings/${payment.booking.id}`} className="link link--mono">
              {payment.booking.reference}
            </Link>
            <p className="muted table__sub">{payment.booking.title}</p>
          </div>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'amount',
      header: 'Amount',
      width: '11rem',
      align: 'right',
      render: (payment) => (
        <div>
          <span className={payment.direction === 'outgoing' ? 'amount amount--out' : 'amount'}>
            {payment.direction === 'outgoing' && '− '}
            {formatMoney(payment.amount, payment.currencyCode)}
          </span>
          {payment.isConverted && (
            <p className="muted table__sub">
              {formatMoney(payment.amountInBase, payment.baseCurrencyCode)} at{' '}
              {payment.exchangeRate}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'direction',
      header: 'Direction',
      width: '8rem',
      hideBelow: 'md',
      render: (payment) => DIRECTION_LABELS[payment.direction] || payment.direction,
    },
    {
      key: 'method',
      header: 'Method',
      width: '8rem',
      hideBelow: 'md',
      render: (payment) => (
        <div>
          {PAYMENT_METHOD_LABELS[payment.method] || payment.method}
          {payment.reference && <p className="muted table__sub">{payment.reference}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '9rem',
      render: (payment) => (
        <Badge tone={paymentStatusTone(payment.status)}>
          {PAYMENT_STATUS_LABELS[payment.status] || payment.status}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="What is still owed, and every movement of money in or out."
      />

      {stats && (
        <>
          <div className="stat-row">
            <Stat
              label="Overdue instalments"
              value={stats.overdueInstalments}
              tone={stats.overdueInstalments > 0 ? 'danger' : undefined}
            />
            <Stat label="Due within a fortnight" value={stats.dueWithinFortnight} />
            <Stat label="Instalments still open" value={stats.openInstalments} />
            <Stat
              label="Awaiting clearance"
              value={stats.paymentsAwaitingClearance}
              hint="payments"
              tone={stats.paymentsAwaitingClearance > 0 ? 'warning' : undefined}
            />
          </div>

          {stats.outstandingByCurrency.length > 0 && (
            <Card
              title="Outstanding by currency"
              subtitle="Kept apart on purpose — adding across currencies would give a figure with no meaning."
            >
              <div className="stat-row">
                {stats.outstandingByCurrency.map((bucket) => (
                  <Stat
                    key={bucket.currencyCode}
                    label={`Owed in ${bucket.currencyCode}`}
                    value={formatMoney(bucket.outstanding, bucket.currencyCode)}
                    hint={
                      bucket.overdue !== '0.00'
                        ? `${formatMoney(bucket.overdue, bucket.currencyCode)} overdue`
                        : 'none overdue'
                    }
                    tone={bucket.overdue !== '0.00' ? 'danger' : undefined}
                  />
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      <Card
        title="Still to be paid"
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
            message="Every instalment on an active booking has been paid, waived or is not yet planned."
          />
        ) : (
          <ul className="confirmation-list">
            {outstanding.data.data.map((schedule) => (
              <li key={schedule.id} className="confirmation">
                <div className="confirmation__body">
                  <div className="confirmation__heading">
                    <strong>{schedule.label}</strong>
                    <Badge tone={scheduleTone(schedule)}>{scheduleLabel(schedule)}</Badge>
                  </div>

                  <p className="muted confirmation__meta">
                    {schedule.booking && (
                      <>
                        <Link to={`/bookings/${schedule.booking.id}`} className="link link--mono">
                          {schedule.booking.reference}
                        </Link>
                        {' · '}
                        {schedule.booking.title}
                      </>
                    )}
                  </p>

                  <p className="muted confirmation__meta">
                    {formatMoney(schedule.outstanding, schedule.currencyCode)} of{' '}
                    {formatMoney(schedule.amount, schedule.currencyCode)} · due{' '}
                    {formatDate(schedule.dueOn)} ({relativeDays(schedule.dueOn)})
                    {schedule.booking?.departureDate &&
                      ` · departs ${formatDate(schedule.booking.departureDate)}`}
                  </p>
                </div>

                <div className="confirmation__actions">
                  <Button size="small" to={`/bookings/${schedule.booking?.id}`}>
                    Open booking
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Ledger" padded={false}>
        <div className="filter-bar">
          <TextField
            label="Reference"
            placeholder="Bank or gateway reference"
            value={ledger.filters.q}
            onChange={(event) => ledger.setFilter('q', event.target.value)}
          />
          <SelectField
            label="Direction"
            value={ledger.filters.direction}
            onChange={(event) => ledger.setFilter('direction', event.target.value)}
            placeholder="Both"
            options={[
              { value: 'incoming', label: 'From travellers' },
              { value: 'outgoing', label: 'To operators' },
            ]}
          />
          <SelectField
            label="Method"
            value={ledger.filters.method}
            onChange={(event) => ledger.setFilter('method', event.target.value)}
            placeholder="Any"
            options={PAYMENT_METHODS.map((method) => ({
              value: method,
              label: PAYMENT_METHOD_LABELS[method],
            }))}
          />
          <SelectField
            label="Status"
            value={ledger.filters.status}
            onChange={(event) => ledger.setFilter('status', event.target.value)}
            placeholder="Any"
            options={Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          {ledger.hasActiveFilters && (
            <div className="filter-bar__reset">
              <Button size="small" onClick={ledger.resetFilters}>
                Clear
              </Button>
            </div>
          )}
        </div>

        {ledger.error ? (
          <div className="card__body">
            <ErrorNotice error={ledger.error} onRetry={ledger.reload} />
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={ledger.items}
            loading={ledger.loading}
            emptyTitle={
              ledger.hasActiveFilters ? 'Nothing matches those filters' : 'No payments yet'
            }
            emptyMessage="Payments are recorded from a booking, by finance."
          />
        )}

        <div className="card__body card__body--tight">
          <Pagination meta={ledger.meta} page={ledger.page} onPageChange={ledger.setPage} />
        </div>
      </Card>
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
