import { Link } from 'react-router-dom';

import Badge from '../../components/common/Badge.jsx';
import Card from '../../components/common/Card.jsx';
import DataTable from '../../components/common/DataTable.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import { PairedBarList } from './BarList.jsx';
import { daysLateLabel, formatMonth, formatRate, rateTone } from './reportLabels.js';
import { formatDate, formatMoney, relativeDays } from '../../utils/format.js';

/**
 * Is the agency delivering what it sold?
 *
 * The departure board at the top is the piece worth arguing for: three
 * readiness questions — documents, ground arrangements, money — that until now
 * could only be answered one booking at a time, by opening three panels. Seeing
 * them as columns across every trip leaving this month is the difference
 * between a set of modules and an information system.
 */
export default function OperationalTab({ data }) {
  const { departures, operators, tasks, overdue } = data;
  const totalOverdue =
    overdue.counts.tasks + overdue.counts.operatorConfirmations + overdue.counts.instalments;

  return (
    <>
      <div className="stat-row">
        <Stat
          label="Departures in range"
          value={departures.summary.departures}
          hint={`next ${departures.horizonDays} days`}
        />
        <Stat
          label="Ready on all three"
          value={departures.summary.readyOnAllThree}
          tone={
            departures.summary.departures > 0 &&
            departures.summary.readyOnAllThree === departures.summary.departures
              ? 'success'
              : undefined
          }
          hint="documents, operators, money"
        />
        <Stat
          label="Past their date"
          value={totalOverdue}
          tone={totalOverdue > 0 ? 'danger' : undefined}
          hint="across three modules"
        />
        <Stat
          label="Tasks open now"
          value={tasks.openNow}
          hint={tasks.overdueNow > 0 ? `${tasks.overdueNow} overdue` : 'none overdue'}
          tone={tasks.overdueNow > 0 ? 'warning' : undefined}
        />
      </div>

      <Card
        title="Departure board"
        subtitle={`Every confirmed trip leaving in the next ${departures.horizonDays} days, and whether it is actually ready.`}
        padded={false}
      >
        {departures.rows.length === 0 ? (
          <EmptyState
            title="Nothing leaving in this window"
            message="Confirmed bookings appear here as their departure dates come into range."
          />
        ) : (
          <DataTable
            columns={[
              {
                key: 'booking',
                header: 'Departure',
                render: (row) => (
                  <div>
                    <Link to={`/bookings/${row.booking.id}`} className="link link--mono">
                      {row.booking.reference}
                    </Link>
                    <p className="muted table__sub">{row.booking.title}</p>
                  </div>
                ),
              },
              {
                key: 'departureDate',
                header: 'Leaves',
                width: '9rem',
                render: (row) => (
                  <div>
                    {formatDate(row.booking.departureDate)}
                    <p className="muted table__sub">{relativeDays(row.booking.departureDate)}</p>
                  </div>
                ),
              },
              {
                key: 'documents',
                header: 'Documents',
                width: '8rem',
                render: (row) => (
                  <Badge tone={row.documents.ready ? 'success' : 'warning'}>
                    {documentsLabel(row.documents)}
                  </Badge>
                ),
              },
              {
                key: 'operators',
                header: 'Operators',
                width: '8rem',
                render: (row) => (
                  <Badge tone={row.operators.ready ? 'success' : 'warning'}>
                    {row.operators.total === 0
                      ? 'Nothing arranged'
                      : row.operators.ready
                        ? 'Confirmed'
                        : `${row.operators.outstanding + row.operators.declined} open`}
                  </Badge>
                ),
              },
              {
                key: 'payments',
                header: 'Money',
                width: '10rem',
                render: (row) =>
                  row.payments.ready ? (
                    <Badge tone="success">Paid</Badge>
                  ) : (
                    <div>
                      <Badge tone={row.payments.overdueInstalments > 0 ? 'danger' : 'warning'}>
                        {row.booking.totalAmount
                          ? `${formatMoney(row.payments.balance, row.booking.currencyCode)} owed`
                          : 'Not priced'}
                      </Badge>
                    </div>
                  ),
              },
            ]}
            rows={departures.rows}
            getRowKey={(row) => row.booking.id}
          />
        )}

        {departures.capped && (
          <div className="card__body card__body--tight">
            <p className="muted small">
              More than {departures.limit} departures fall in this window. Showing the
              {' '}
              {departures.limit} leaving soonest — narrow the horizon to see the rest.
            </p>
          </div>
        )}
      </Card>

      <Card
        title="Past its date"
        subtitle="Late work from three modules, in one place."
        padded={false}
      >
        {totalOverdue === 0 ? (
          <EmptyState
            title="Nothing is overdue"
            message="No late tasks, unanswered operator requests or unpaid instalments."
          />
        ) : (
          <div className="overdue-grid">
            <OverdueColumn
              title="Tasks"
              count={overdue.counts.tasks}
              items={overdue.tasks.map((row) => ({
                id: row.id,
                primary: row.title,
                secondary: daysLateLabel(row.daysLate),
                bookingId: row.booking?.id,
                reference: row.booking?.reference,
              }))}
            />
            <OverdueColumn
              title="Operator replies"
              count={overdue.counts.operatorConfirmations}
              items={overdue.operatorConfirmations.map((row) => ({
                id: row.id,
                primary: row.summary,
                secondary: `${row.operator || 'Operator'} · ${daysLateLabel(row.daysLate)}`,
                bookingId: row.booking?.id,
                reference: row.booking?.reference,
              }))}
            />
            <OverdueColumn
              title="Instalments"
              count={overdue.counts.instalments}
              items={overdue.instalments.map((row) => ({
                id: row.id,
                primary: `${row.label} — ${formatMoney(row.outstanding, row.currencyCode)}`,
                secondary: daysLateLabel(row.daysLate),
                bookingId: row.booking?.id,
                reference: row.booking?.reference,
              }))}
            />
          </div>
        )}
      </Card>

      <Card
        title="Partner reliability"
        subtitle="Measured from what operators answered, not from opinion."
        padded={false}
      >
        <DataTable
          columns={[
            {
              key: 'name',
              header: 'Operator',
              render: (row) => (
                <div>
                  <Link to={`/operators/${row.operatorId}`} className="link">
                    {row.name}
                  </Link>
                  {!row.isVetted && (
                    <>
                      {' '}
                      <Badge tone="warning">Not vetted</Badge>
                    </>
                  )}
                  {row.destination && <p className="muted table__sub">{row.destination}</p>}
                </div>
              ),
            },
            {
              key: 'total',
              header: 'Asked',
              width: '6rem',
              align: 'right',
              render: (row) => row.total,
            },
            {
              key: 'confirmationRate',
              header: 'Said yes',
              width: '8rem',
              render: (row) => (
                <Badge tone={rateTone(row.confirmationRate)}>
                  {formatRate(row.confirmationRate)}
                </Badge>
              ),
            },
            {
              key: 'averageResponseDays',
              header: 'Replies in',
              width: '9rem',
              align: 'right',
              hideBelow: 'md',
              render: (row) =>
                row.averageResponseDays === null ? (
                  <span className="muted">—</span>
                ) : (
                  <div>
                    {row.averageResponseDays}d
                    <p className="muted table__sub">says {row.statedResponseDays}d</p>
                  </div>
                ),
            },
            {
              key: 'outstanding',
              header: 'Waiting',
              width: '7rem',
              align: 'right',
              render: (row) => (
                <div>
                  {row.outstanding}
                  {row.overdue > 0 && (
                    <p className="muted table__sub">{row.overdue} late</p>
                  )}
                </div>
              ),
            },
          ]}
          rows={operators.rows}
          getRowKey={(row) => row.operatorId}
          emptyTitle="No operators yet"
          emptyMessage="Guides, lodges and transfer partners appear here once they are added."
        />
        {operators.unvetted > 0 && (
          <div className="card__body card__body--tight">
            <p className="muted small">
              {operators.unvetted} active partner{operators.unvetted === 1 ? '' : 's'}{' '}
              {operators.unvetted === 1 ? 'has' : 'have'} not been vetted and cannot be given
              work.
            </p>
          </div>
        )}
      </Card>

      <Card
        title="Task throughput"
        subtitle="Work raised against work closed. A month where more came in than left is the warning."
      >
        <PairedBarList
          rows={tasks.rows.map((row) => ({
            label: formatMonth(row.month),
            a: row.raised,
            b: row.closed,
          }))}
          labels={['Raised', 'Closed']}
          emptyMessage="No tasks were raised or closed in this window."
        />
        <p className="muted small report-note">
          {tasks.raised} raised, {tasks.closed} closed
          {tasks.averageDaysToClose !== null &&
            `, averaging ${tasks.averageDaysToClose} days to close`}
          . {tasks.openNow} open right now
          {tasks.overdueNow > 0 && `, of which ${tasks.overdueNow} are past their date`}.
        </p>
      </Card>
    </>
  );
}

/**
 * Why a booking's documents are not ready.
 *
 * "0 missing" was the first thing this said for a trip with nobody on it yet,
 * which is both true and useless — there is nothing missing because there is
 * nobody to be missing it. Naming the actual blocker is the difference between
 * a board somebody acts on and one they learn to ignore.
 */
function documentsLabel(documents) {
  if (documents.ready) return 'Ready';
  if (documents.outstanding === null) return 'No itinerary';
  if (!documents.partySize) return 'No party yet';
  if (documents.outstanding === 0) return 'Awaiting checks';
  return `${documents.outstanding} missing`;
}

function OverdueColumn({ title, count, items }) {
  return (
    <section className="overdue-grid__column">
      <h3 className="overdue-grid__title">
        {title}
        <Badge tone={count > 0 ? 'danger' : 'neutral'}>{count}</Badge>
      </h3>
      {items.length === 0 ? (
        <p className="muted small">Nothing late.</p>
      ) : (
        <ul className="overdue-list">
          {items.map((item) => (
            <li key={item.id}>
              <p className="overdue-list__primary">{item.primary}</p>
              <p className="muted small">
                {item.secondary}
                {item.reference && (
                  <>
                    {' · '}
                    <Link to={`/bookings/${item.bookingId}`} className="link link--mono">
                      {item.reference}
                    </Link>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
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
