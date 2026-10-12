import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import Badge from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import Card from '../components/common/Card.jsx';
import ErrorNotice from '../components/common/ErrorNotice.jsx';
import Modal, { ConfirmModal } from '../components/common/Modal.jsx';
import Spinner from '../components/common/Spinner.jsx';
import { TextArea } from '../components/common/Field.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import BookingForm from '../features/bookings/BookingForm.jsx';
import ItineraryPanel from '../features/bookings/ItineraryPanel.jsx';
import PartyPanel from '../features/bookings/PartyPanel.jsx';
import ReadinessPanel from '../features/bookings/ReadinessPanel.jsx';
import TasksPanel from '../features/bookings/TasksPanel.jsx';
import OperatorConfirmationsPanel from '../features/operators/OperatorConfirmationsPanel.jsx';
import PaymentsPanel from '../features/payments/PaymentsPanel.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import * as bookingsService from '../services/bookings.service.js';
import { listDestinations } from '../services/destinations.service.js';
import { listUsers } from '../services/users.service.js';
import {
  BOOKING_STATUS_LABELS,
  bookingStatusTone,
  formatDate,
  formatDateTime,
  formatMoney,
  relativeDays,
} from '../utils/format.js';
import { can } from '../utils/permissions.js';

export default function BookingDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();

  const [booking, setBooking] = useState(null);
  const [segments, setSegments] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [readiness, setReadiness] = useState(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessError, setReadinessError] = useState(null);

  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);

  const editable = can.editTrips(user) && booking?.status !== 'cancelled';

  const loadReadiness = useCallback(async (bookingId) => {
    setReadinessLoading(true);
    setReadinessError(null);
    try {
      const response = await bookingsService.getReadiness(bookingId);
      setReadiness(response.data ?? response);
    } catch (caught) {
      setReadinessError(caught);
      setReadiness(null);
    } finally {
      setReadinessLoading(false);
    }
  }, []);

  const loadSegments = useCallback(async (bookingId) => {
    const response = await bookingsService.listSegments(bookingId);
    setSegments(response.data || []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bookingData, segmentsResponse, destinationsResponse] = await Promise.all([
        bookingsService.getBooking(id),
        bookingsService.listSegments(id),
        listDestinations({ isActive: 'true', perPage: 100 }),
      ]);
      setBooking(bookingData);
      setSegments(segmentsResponse.data || []);
      setDestinations(destinationsResponse.data || []);
      loadReadiness(id);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [id, loadReadiness]);

  useEffect(() => {
    load();
  }, [load]);

  // Staff list is admin-only; failing to load it should not break the page.
  useEffect(() => {
    if (!can.manageStaff(user)) return;
    listUsers({ isActive: 'true', perPage: 100 })
      .then((response) => setStaff(response.data || []))
      .catch(() => setStaff([]));
  }, [user]);

  async function handleUpdate(payload) {
    const updated = await bookingsService.updateBooking(id, payload);
    setBooking(updated);
    setEditing(false);
    toast.success('Booking updated.');
  }

  async function handleStatus(status) {
    setBusy(true);
    try {
      const updated = await bookingsService.updateBooking(id, { status });
      setBooking(updated);
      toast.success(`Moved to ${BOOKING_STATUS_LABELS[status] || status}.`);
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    setBusy(true);
    try {
      const updated = await bookingsService.cancelBooking(id, cancelReason.trim());
      setBooking(updated);
      setCancelling(false);
      setCancelReason('');
      toast.success('Booking cancelled.');
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshAfterItineraryChange() {
    await loadSegments(id);
    // Destinations drive the document requirements, so readiness is now stale.
    await loadReadiness(id);
  }

  function handlePartyChange(updated) {
    setBooking(updated);
    loadReadiness(id);
  }

  if (loading) return <Spinner block label="Loading booking…" />;
  if (error) return <ErrorNotice error={error} onRetry={load} />;
  if (!booking) return null;

  return (
    <>
      <PageHeader
        backTo="/bookings"
        backLabel="Bookings"
        title={booking.title}
        subtitle={booking.reference}
        meta={
          <div className="page-header__badges">
            <Badge tone={bookingStatusTone(booking.status)}>
              {BOOKING_STATUS_LABELS[booking.status] || booking.status}
            </Badge>
            {booking.departureDate && (
              <span className="muted">
                Departs {formatDate(booking.departureDate)} · {relativeDays(booking.departureDate)}
              </span>
            )}
          </div>
        }
        actions={
          editable && (
            <>
              <Button onClick={() => setEditing(true)}>Edit</Button>
              <Button variant="danger" onClick={() => setCancelling(true)}>
                Cancel booking
              </Button>
            </>
          )
        }
      />

      {booking.status === 'cancelled' && (
        <div className="alert alert--warning">
          <p className="alert__title">This booking was cancelled</p>
          <p className="alert__message">
            {booking.cancellationReason}
            {booking.cancelledAt && ` — ${formatDateTime(booking.cancelledAt)}`}
          </p>
        </div>
      )}

      {editable && booking.allowedNextStatuses?.length > 0 && (
        <Card title="Move this booking forward" muted>
          <div className="button-row">
            {booking.allowedNextStatuses
              .filter((status) => status !== 'cancelled')
              .map((status) => (
                <Button
                  key={status}
                  variant="primary"
                  disabled={busy}
                  onClick={() => handleStatus(status)}
                >
                  {/* Lower-cased so "Mark as in progress" reads as a sentence
                      rather than "Mark In progress". */}
                  Mark as {(BOOKING_STATUS_LABELS[status] || status).toLowerCase()}
                </Button>
              ))}
            {booking.allowedNextStatuses.filter((s) => s !== 'cancelled').length === 0 && (
              <p className="muted">Cancelling is the only move available from here.</p>
            )}
          </div>
        </Card>
      )}

      <div className="detail-grid">
        <div className="detail-grid__main">
          <ItineraryPanel
            booking={booking}
            segments={segments}
            destinations={destinations}
            canEdit={editable}
            onChange={refreshAfterItineraryChange}
          />

          <ReadinessPanel
            readiness={readiness}
            loading={readinessLoading}
            error={readinessError}
            onRefresh={() => loadReadiness(id)}
          />

          {/* The other half of "is this trip ready". A party can have every
              passport and policy in order and still have nowhere to sleep in
              Namche, so this sits directly beneath document readiness. */}
          <OperatorConfirmationsPanel
            booking={booking}
            segments={segments}
            canEdit={editable}
          />

          {/* The third readiness question, after documents and operators: has
              this trip been paid for. A cancelled booking still shows it —
              what was received and what has to go back is exactly the thing
              somebody needs after a cancellation. */}
          <PaymentsPanel booking={booking} canEdit={booking.status !== 'cancelled'} />

          {/* Sits under readiness on purpose: the gaps above are where most of
              these tasks come from, and reading them in that order is how the
              work actually flows. */}
          <TasksPanel
            booking={booking}
            canEdit={editable}
            onChanged={() => loadReadiness(id)}
          />
        </div>

        <div className="detail-grid__side">
          <Card title="Details">
            <dl className="detail-list">
              <Row label="Consultant" value={booking.consultant?.fullName} />
              <Row label="Coordinator" value={booking.coordinator?.fullName || 'Not assigned'} />
              <Row label="Departure" value={formatDate(booking.departureDate)} />
              <Row label="Return" value={formatDate(booking.returnDate)} />
              <Row label="Party size" value={booking.partySize} />
              <Row
                label="Total"
                value={formatMoney(booking.totalAmount, booking.currencyCode)}
              />
              <Row
                label="Deposit"
                value={formatMoney(booking.depositAmount, booking.currencyCode)}
              />
            </dl>
            {booking.notes && (
              <>
                <h3 className="form-section">Notes</h3>
                <p className="preserve-lines">{booking.notes}</p>
              </>
            )}
          </Card>

          <PartyPanel booking={booking} canEdit={editable} onChange={handlePartyChange} />
        </div>
      </div>

      <Modal open={editing} title="Edit booking" onClose={() => setEditing(false)}>
        <BookingForm
          booking={booking}
          staff={staff}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(false)}
        />
      </Modal>

      <ConfirmModal
        open={cancelling}
        title="Cancel this booking?"
        confirmLabel="Cancel booking"
        loading={busy}
        onConfirm={handleCancel}
        onClose={() => setCancelling(false)}
      >
        <p className="muted">
          A cancelled booking cannot be edited or reopened. The reason is kept on the record.
        </p>
        <TextArea
          label="Reason"
          required
          rows={3}
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
          placeholder="Traveller withdrew after a family emergency."
        />
      </ConfirmModal>
    </>
  );
}

function Row({ label, value }) {
  return (
    <div className="detail-list__row">
      <dt>{label}</dt>
      <dd>{value ?? '—'}</dd>
    </div>
  );
}
