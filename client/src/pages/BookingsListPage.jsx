import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import Badge from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import Card from '../components/common/Card.jsx';
import DataTable from '../components/common/DataTable.jsx';
import ErrorNotice from '../components/common/ErrorNotice.jsx';
import Modal from '../components/common/Modal.jsx';
import Pagination from '../components/common/Pagination.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import { SelectField, TextField } from '../components/common/Field.jsx';
import BookingForm from '../features/bookings/BookingForm.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { useList } from '../hooks/useList.js';
import * as bookingsService from '../services/bookings.service.js';
import { listUsers } from '../services/users.service.js';
import {
  BOOKING_STATUS_LABELS,
  bookingStatusTone,
  formatDate,
  formatMoney,
  relativeDays,
} from '../utils/format.js';
import { can } from '../utils/permissions.js';

const STATUS_OPTIONS = Object.entries(BOOKING_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export default function BookingsListPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const list = useList(bookingsService.listBookings, {
    initialFilters: { status: '', q: '', departingAfter: '' },
  });

  // Only admins may list staff, so everyone else gets an empty coordinator
  // picker rather than a 403 surfacing on a screen that otherwise works.
  const staff = useAsync(
    () =>
      can.manageStaff(user)
        ? listUsers({ isActive: 'true', perPage: 100 }).then((response) => response.data)
        : Promise.resolve([]),
    [user.role]
  );

  const columns = [
    {
      key: 'reference',
      header: 'Reference',
      width: '9rem',
      render: (booking) => (
        <Link to={`/bookings/${booking.id}`} className="link link--mono">
          {booking.reference}
        </Link>
      ),
    },
    {
      key: 'title',
      header: 'Trip',
      render: (booking) => (
        <div>
          <Link to={`/bookings/${booking.id}`} className="link">
            {booking.title}
          </Link>
          {booking.leadTraveller && (
            <p className="muted table__sub">{booking.leadTraveller.fullName}</p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '8rem',
      render: (booking) => (
        <Badge tone={bookingStatusTone(booking.status)}>
          {BOOKING_STATUS_LABELS[booking.status] || booking.status}
        </Badge>
      ),
    },
    {
      key: 'departureDate',
      header: 'Departs',
      width: '10rem',
      render: (booking) =>
        booking.departureDate ? (
          <div>
            {formatDate(booking.departureDate)}
            <p className="muted table__sub">{relativeDays(booking.departureDate)}</p>
          </div>
        ) : (
          <span className="muted">Not set</span>
        ),
    },
    {
      key: 'partySize',
      header: 'Party',
      width: '5rem',
      align: 'right',
      hideBelow: 'md',
      render: (booking) => booking.partySize,
    },
    {
      key: 'totalAmount',
      header: 'Total',
      width: '9rem',
      align: 'right',
      hideBelow: 'md',
      render: (booking) => formatMoney(booking.totalAmount, booking.currencyCode),
    },
  ];

  async function handleCreate(payload) {
    const booking = await bookingsService.createBooking(payload);
    setCreating(false);
    toast.success(`Booking ${booking.reference} created.`);
    navigate(`/bookings/${booking.id}`);
  }

  return (
    <>
      <PageHeader
        title="Bookings"
        subtitle="Every trip from first enquiry to departure."
        actions={
          can.editTrips(user) && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              New booking
            </Button>
          )
        }
      />

      <Card padded={false}>
        <div className="filter-bar">
          <TextField
            label="Search"
            placeholder="Title or reference"
            value={list.filters.q}
            onChange={(event) => list.setFilter('q', event.target.value)}
          />
          <SelectField
            label="Status"
            value={list.filters.status}
            onChange={(event) => list.setFilter('status', event.target.value)}
            placeholder="Any status"
            options={STATUS_OPTIONS}
          />
          <TextField
            label="Departing after"
            type="date"
            value={list.filters.departingAfter}
            onChange={(event) => list.setFilter('departingAfter', event.target.value)}
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
            emptyTitle={
              list.hasActiveFilters ? 'Nothing matches those filters' : 'No bookings yet'
            }
            emptyMessage={
              list.hasActiveFilters
                ? 'Try widening the search or clearing the filters.'
                : 'Create the first booking to get started.'
            }
            emptyAction={
              list.hasActiveFilters ? (
                <Button onClick={list.resetFilters}>Clear filters</Button>
              ) : (
                can.editTrips(user) && (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    New booking
                  </Button>
                )
              )
            }
          />
        )}

        <div className="card__body card__body--tight">
          <Pagination meta={list.meta} page={list.page} onPageChange={list.setPage} />
        </div>
      </Card>

      <Modal open={creating} title="New booking" onClose={() => setCreating(false)}>
        <BookingForm
          staff={staff.data || []}
          onSubmit={handleCreate}
          onCancel={() => setCreating(false)}
        />
      </Modal>
    </>
  );
}
