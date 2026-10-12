import { Link } from 'react-router-dom';

import Badge from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import Card from '../components/common/Card.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import ErrorNotice from '../components/common/ErrorNotice.jsx';
import Spinner from '../components/common/Spinner.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { listBookings } from '../services/bookings.service.js';
import { getHeadline } from '../services/reports.service.js';
import { getTaskSummary, listTasks } from '../services/tasks.service.js';
import { dueLabel } from '../features/tasks/taskLabels.js';
import {
  BOOKING_STATUS_LABELS,
  bookingStatusTone,
  formatDate,
  relativeDays,
} from '../utils/format.js';
import { can } from '../utils/permissions.js';

/**
 * What a consultant wants on opening the app: what is leaving soon, and what is
 * sitting in the pipeline waiting on them.
 *
 * The headline figures come from /reports/headline, which is the same
 * aggregation the reports page uses — so the dashboard and the reports cannot
 * disagree about how many enquiries are open or how many departures are ready.
 * That endpoint is deliberately narrower than a whole reporting tab: this is the
 * landing screen and it has to stay quick.
 *
 * The counts here used to be `meta.total` read off filtered list calls, which
 * was an honest stand-in but could not answer the question that actually
 * matters — not "how many trips are leaving" but "how many of them are ready".
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);

  const upcoming = useAsync(
    () =>
      listBookings({
        status: 'confirmed,in_progress',
        departingAfter: today,
        sort: 'departureDate:asc',
        perPage: 6,
      }),
    []
  );

  const openEnquiries = useAsync(
    () => listBookings({ status: 'enquiry,quoted', sort: 'createdAt:desc', perPage: 6 }),
    []
  );

  // The headline figures. Failing to load these must not take the dashboard
  // down — the departure list and the task queue below are the working parts.
  const headline = useAsync(() => getHeadline(), []);

  const taskSummary = useAsync(() => getTaskSummary(), []);
  const myTasks = useAsync(
    () => listTasks({ assignedTo: 'me', status: 'open', perPage: 5 }),
    []
  );

  const loading = upcoming.loading || openEnquiries.loading;
  const error = upcoming.error || openEnquiries.error;

  return (
    <>
      <PageHeader
        title={`Good day, ${user.firstName}`}
        subtitle="Departures on the horizon and enquiries still open."
        actions={
          <>
            <Button to="/reports">Reports</Button>
            {can.editTrips(user) && (
              <Button variant="primary" to="/bookings">
                Go to bookings
              </Button>
            )}
          </>
        }
      />

      {error && <ErrorNotice error={error} onRetry={() => window.location.reload()} />}

      {loading ? (
        <Spinner block label="Loading your day…" />
      ) : (
        <>
          <div className="stat-row">
            <Stat
              label="Departing within 30 days"
              value={headline.data?.departures?.departures ?? upcoming.data?.meta?.total ?? 0}
              hint={
                headline.data?.departures
                  ? `${headline.data.departures.readyOnAllThree} ready on documents, operators and money`
                  : 'Confirmed or under way'
              }
              /* The count is not the useful number; the gap between it and
                 "ready" is. Amber whenever something is not ready, so the tile
                 is a prompt rather than a scoreboard. */
              tone={
                headline.data?.departures &&
                headline.data.departures.departures > headline.data.departures.readyOnAllThree
                  ? 'warning'
                  : undefined
              }
            />
            <Stat
              label="Open enquiries"
              value={headline.data?.pipeline?.stillOpen ?? openEnquiries.data?.meta?.total ?? 0}
              hint={
                headline.data?.pipeline?.conversionRate === null ||
                headline.data?.pipeline?.conversionRate === undefined
                  ? 'Enquiry or quoted'
                  : `${headline.data.pipeline.conversionRate}% converted this year`
              }
            />
            <Stat
              label="Tasks on you"
              value={taskSummary.data?.mine ?? 0}
              hint={
                taskSummary.data?.mineOverdue
                  ? `${taskSummary.data.mineOverdue} overdue`
                  : 'Nothing late'
              }
            />
            <Stat
              label="Unassigned"
              value={taskSummary.data?.unassigned ?? 0}
              hint="Work nobody has picked up"
            />
          </div>

          <div className="detail-grid">
            <div className="detail-grid__main">
              <Card
                title="Next departures"
                actions={
                  <Button size="small" to="/bookings?status=confirmed">
                    See all
                  </Button>
                }
                padded={!upcoming.data?.data?.length}
              >
                <BookingList
                  bookings={upcoming.data?.data || []}
                  emptyTitle="Nothing departing yet"
                  emptyMessage="Confirmed bookings with a departure date appear here."
                  showDeparture
                />
              </Card>
            </div>

            <div className="detail-grid__side">
              <Card
                title="Your tasks"
                actions={
                  <Button size="small" to="/tasks">
                    Open the queue
                  </Button>
                }
                padded={!myTasks.data?.data?.length}
              >
                {myTasks.data?.data?.length ? (
                  <ul className="mini-list">
                    {myTasks.data.data.map((task) => {
                      const due = dueLabel(task);
                      return (
                        <li key={task.id} className="mini-list__item">
                          <div>
                            <Link to="/tasks" className="link">
                              {task.title}
                            </Link>
                            <p className="muted table__sub">
                              <span className="mono">{task.booking?.reference}</span>
                            </p>
                          </div>
                          <span className={due.tone === 'muted' ? 'muted' : `text-${due.tone}`}>
                            {due.text}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <EmptyState
                    title="Nothing assigned to you"
                    message="Work you are responsible for appears here."
                  />
                )}
              </Card>

              <Card
                title="Open enquiries"
                padded={!openEnquiries.data?.data?.length}
              >
                <BookingList
                  bookings={openEnquiries.data?.data || []}
                  emptyTitle="No open enquiries"
                  emptyMessage="New enquiries land here."
                />
              </Card>

              <Card title="Still to come" muted>
                <p className="muted">
                  Ground operator coordination, payments and the reporting dashboard are not
                  built yet. This screen becomes the real pipeline view once reporting lands.
                </p>
              </Card>
            </div>
          </div>
        </>
      )}
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

function BookingList({ bookings, emptyTitle, emptyMessage, showDeparture = false }) {
  if (bookings.length === 0) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />;
  }

  return (
    <ul className="mini-list">
      {bookings.map((booking) => (
        <li key={booking.id} className="mini-list__item">
          <div>
            <Link to={`/bookings/${booking.id}`} className="link">
              {booking.title}
            </Link>
            <p className="muted table__sub">
              <span className="mono">{booking.reference}</span>
              {showDeparture && booking.departureDate && (
                <> · {formatDate(booking.departureDate)} ({relativeDays(booking.departureDate)})</>
              )}
            </p>
          </div>
          <Badge tone={bookingStatusTone(booking.status)}>
            {BOOKING_STATUS_LABELS[booking.status] || booking.status}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
