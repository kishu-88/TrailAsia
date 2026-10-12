import { useState } from 'react';
import { Link } from 'react-router-dom';

import Badge from '../../components/common/Badge.jsx';
import Button from '../../components/common/Button.jsx';
import Card from '../../components/common/Card.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import ErrorNotice from '../../components/common/ErrorNotice.jsx';
import Modal, { ConfirmModal } from '../../components/common/Modal.jsx';
import { CheckboxField, SelectField } from '../../components/common/Field.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import * as bookingsService from '../../services/bookings.service.js';
import { listTravellers } from '../../services/travellers.service.js';

/** Who is going. The lead traveller is the agency's point of contact for the trip. */
export default function PartyPanel({ booking, canEdit, onChange }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [options, setOptions] = useState([]);
  const [selected, setSelected] = useState('');
  const [isLead, setIsLead] = useState(false);

  const travellers = booking.travellers || [];
  const onBooking = new Set(travellers.map((traveller) => traveller.id));

  async function openAdd() {
    setError(null);
    setSelected('');
    setIsLead(false);
    setAdding(true);
    try {
      // Only active travellers, and only those not already on the booking —
      // offering a name that will be rejected is a pointless round trip.
      const response = await listTravellers({ isActive: 'true', perPage: 100 });
      setOptions(response.data.filter((traveller) => !onBooking.has(traveller.id)));
    } catch (caught) {
      setError(caught);
    }
  }

  async function handleAdd() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await bookingsService.addBookingTraveller(booking.id, {
        travellerId: selected,
        isLead,
      });
      onChange(updated);
      setAdding(false);
      toast.success('Traveller added to the booking.');
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      const updated = await bookingsService.removeBookingTraveller(booking.id, removing.id);
      onChange(updated);
      setRemoving(null);
      toast.success('Traveller removed.');
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={`Party (${travellers.length})`}
      subtitle={
        booking.partySize && travellers.length !== booking.partySize
          ? `Booking is for ${booking.partySize} — ${travellers.length} recorded`
          : undefined
      }
      actions={
        canEdit && (
          <Button size="small" onClick={openAdd}>
            Add traveller
          </Button>
        )
      }
      padded={travellers.length === 0}
    >
      {travellers.length === 0 ? (
        <EmptyState
          title="Nobody added yet"
          message="Add the travellers so their documents can be checked against the itinerary."
        />
      ) : (
        <ul className="party-list">
          {travellers.map((traveller) => (
            <li key={traveller.id} className="party-list__item">
              <div>
                <Link to={`/travellers/${traveller.id}`} className="link">
                  {traveller.fullName}
                </Link>
                {traveller.isLead && (
                  <>
                    {' '}
                    <Badge tone="info">Lead</Badge>
                  </>
                )}
              </div>
              <div className="party-list__actions">
                {/* Opens what this traveller would see on their phone. Useful
                    for a coordinator answering "what does it say on my end?" */}
                <Button
                  size="small"
                  variant="ghost"
                  to={`/preview/trip/${booking.id}/${traveller.id}`}
                >
                  Traveller view
                </Button>
                {canEdit && (
                  <Button
                    size="small"
                    variant="ghost"
                    onClick={() => setRemoving(traveller)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={adding}
        title="Add a traveller"
        onClose={() => setAdding(false)}
        size="small"
        footer={
          <>
            <Button onClick={() => setAdding(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAdd} loading={busy} disabled={!selected}>
              Add
            </Button>
          </>
        }
      >
        {error && <ErrorNotice error={error} />}
        <SelectField
          label="Traveller"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          placeholder="Choose someone…"
          options={options.map((traveller) => ({
            value: traveller.id,
            label: traveller.fullName,
          }))}
          hint={
            options.length === 0
              ? 'Everyone on file is already on this booking, or none have been created yet.'
              : undefined
          }
        />
        <CheckboxField
          label="Make this the lead traveller"
          hint="Replaces the current lead."
          checked={isLead}
          onChange={(event) => setIsLead(event.target.checked)}
        />
      </Modal>

      <ConfirmModal
        open={Boolean(removing)}
        title="Remove from booking?"
        message={`${removing?.fullName} will be taken off this booking. Their traveller record and documents are not deleted.`}
        confirmLabel="Remove"
        loading={busy}
        onConfirm={handleRemove}
        onClose={() => setRemoving(null)}
      />
    </Card>
  );
}
