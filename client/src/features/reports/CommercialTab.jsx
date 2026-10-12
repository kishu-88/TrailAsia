import Badge from '../../components/common/Badge.jsx';
import Card from '../../components/common/Card.jsx';
import DataTable from '../../components/common/DataTable.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import BarList from './BarList.jsx';
import { formatMonth, formatRate, rateTone } from './reportLabels.js';
import { BOOKING_STATUS_LABELS, bookingStatusTone, formatMoney } from '../../utils/format.js';

/**
 * Is the agency selling, and what is it selling?
 *
 * Four questions in the order a manager asks them: how did the pipeline turn
 * out, where is the money coming from, who is converting, and is the cash
 * actually arriving.
 */
export default function CommercialTab({ data }) {
  const { pipeline, destinations, consultants, timeline } = data;

  return (
    <>
      <div className="stat-row">
        <Stat label="Enquiries taken" value={pipeline.total} />
        <Stat label="Won" value={pipeline.won} tone={pipeline.won > 0 ? 'success' : undefined} />
        <Stat label="Lost" value={pipeline.lost} tone={pipeline.lost > 0 ? 'danger' : undefined} />
        <Stat
          label="Conversion"
          value={formatRate(pipeline.conversionRate)}
          hint={
            pipeline.stillOpen > 0
              ? `${pipeline.stillOpen} still open, not counted`
              : 'of decided enquiries'
          }
          tone={rateTone(pipeline.conversionRate)}
        />
      </div>

      {/* The denominator is the thing people get wrong about a conversion rate,
          so the page says what it is rather than leaving it to be assumed. */}
      <Card title="Pipeline" subtitle="Every booking raised in this window, and where it got to.">
        {pipeline.total === 0 ? (
          <EmptyState
            title="No bookings in this window"
            message="Widen the date range, or start taking enquiries."
          />
        ) : (
          <>
            <ul className="pipeline-list">
              {pipeline.byStatus
                .slice()
                .sort((a, b) => b.count - a.count)
                .map((row) => (
                  <li key={row.status} className="pipeline-list__row">
                    <Badge tone={bookingStatusTone(row.status)}>
                      {BOOKING_STATUS_LABELS[row.status] || row.status}
                    </Badge>
                    <span className="pipeline-list__count">{row.count}</span>
                    <span className="muted">
                      {row.value.length === 0
                        ? 'not priced'
                        : row.value
                            .map((v) => formatMoney(v.total, v.currencyCode))
                            .join(' · ')}
                    </span>
                  </li>
                ))}
            </ul>
            <p className="muted small report-note">
              Conversion is {pipeline.won} won out of {pipeline.decided} decided.
              {pipeline.stillOpen > 0 &&
                ` The ${pipeline.stillOpen} still in the pipeline are left out — an enquiry
                  raised this week is not a lost sale.`}
            </p>
          </>
        )}
      </Card>

      <Card
        title="Revenue by destination"
        subtitle="Where won bookings start. A multi-country trip counts once, against its first leg."
      >
        <BarList
          rows={destinations.rows.map((row) => ({
            key: `${row.leadDestination}-${row.currencyCode}`,
            label: row.leadDestination,
            sub: `${row.bookings} booking${row.bookings === 1 ? '' : 's'}`,
            value: row.value,
            display: formatMoney(row.value, row.currencyCode),
          }))}
          valueHeader="Won"
          emptyMessage="No won bookings with an itinerary in this window."
        />
        {destinations.unattributedBookings > 0 && (
          <p className="muted small report-note">
            {destinations.unattributedBookings} won booking
            {destinations.unattributedBookings === 1 ? ' has' : 's have'} no itinerary yet, so
            {destinations.unattributedBookings === 1 ? ' it is' : ' they are'} not in the table
            above. Named rather than dropped — a report whose rows do not add up to the total is
            one nobody trusts.
          </p>
        )}
      </Card>

      <Card
        title={consultants.restricted ? 'Your figures' : 'Consultant performance'}
        subtitle={
          consultants.restricted
            ? 'Your own pipeline. The agency-wide comparison is management data.'
            : 'Conversion measured on decided enquiries only.'
        }
        padded={false}
      >
        <DataTable
          columns={[
            { key: 'name', header: 'Consultant', render: (row) => row.name },
            { key: 'created', header: 'Taken', width: '6rem', align: 'right', render: (row) => row.created },
            { key: 'won', header: 'Won', width: '5rem', align: 'right', render: (row) => row.won },
            { key: 'lost', header: 'Lost', width: '5rem', align: 'right', render: (row) => row.lost },
            {
              key: 'stillOpen',
              header: 'Open',
              width: '5rem',
              align: 'right',
              hideBelow: 'md',
              render: (row) => row.stillOpen,
            },
            {
              key: 'conversionRate',
              header: 'Conversion',
              width: '8rem',
              render: (row) => (
                <Badge tone={rateTone(row.conversionRate)}>{formatRate(row.conversionRate)}</Badge>
              ),
            },
            {
              key: 'value',
              header: 'Won value',
              width: '12rem',
              align: 'right',
              render: (row) =>
                row.value.length === 0 ? (
                  <span className="muted">—</span>
                ) : (
                  <div>
                    {row.value.map((v) => (
                      <p key={v.currencyCode} className="amount">
                        {formatMoney(v.total, v.currencyCode)}
                      </p>
                    ))}
                  </div>
                ),
            },
          ]}
          rows={consultants.rows}
          getRowKey={(row) => row.consultantId}
          emptyTitle="Nothing in this window"
          emptyMessage="No bookings were raised in the selected range."
        />
      </Card>

      <Card
        title="Money received"
        subtitle="Cleared payments, by the month the money arrived — not the month it was keyed."
      >
        <BarList
          rows={timeline.rows.map((row) => ({
            key: `${row.month}-${row.currencyCode}`,
            label: formatMonth(row.month),
            sub:
              timeline.rows.some((other) => other.currencyCode !== row.currencyCode)
                ? row.currencyCode
                : `${row.payments} payment${row.payments === 1 ? '' : 's'}`,
            value: row.received,
            display: formatMoney(row.received, row.currencyCode),
            tone: 'success',
          }))}
          valueHeader="Received"
          emptyMessage="No cleared payments in this window."
        />
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
