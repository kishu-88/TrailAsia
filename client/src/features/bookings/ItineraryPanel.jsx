import { useState } from 'react';

import Button from '../../components/common/Button.jsx';
import Card from '../../components/common/Card.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import ErrorNotice from '../../components/common/ErrorNotice.jsx';
import Modal, { ConfirmModal } from '../../components/common/Modal.jsx';
import {
  FieldGrid,
  SelectField,
  TextArea,
  TextField,
} from '../../components/common/Field.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import * as bookingsService from '../../services/bookings.service.js';
import { formatDate } from '../../utils/format.js';

const BLANK = {
  destinationId: '',
  title: '',
  description: '',
  startDate: '',
  endDate: '',
  accommodation: '',
  transportNotes: '',
  maxAltitudeMetres: '',
};

/**
 * The itinerary: an ordered list of segments, each tied to a destination.
 *
 * Order matters beyond presentation — the destinations here are what the
 * readiness check compares traveller documents against, and the highest
 * `maxAltitudeMetres` is what insurance cover is measured against.
 */
export default function ItineraryPanel({ booking, destinations, canEdit, segments, onChange }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null); // segment being edited, or 'new'
  const [values, setValues] = useState(BLANK);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (event) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));
  const fieldError = (name) => error?.details?.[name];

  function openNew() {
    setValues(BLANK);
    setError(null);
    setEditing('new');
  }

  function openEdit(segment) {
    setValues({
      destinationId: segment.destinationId,
      title: segment.title,
      description: segment.description || '',
      startDate: segment.startDate || '',
      endDate: segment.endDate || '',
      accommodation: segment.accommodation || '',
      transportNotes: segment.transportNotes || '',
      maxAltitudeMetres: segment.maxAltitudeMetres ?? '',
    });
    setError(null);
    setEditing(segment);
  }

  async function handleSave(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const payload = {
      destinationId: values.destinationId,
      title: values.title.trim(),
      description: values.description.trim() || null,
      startDate: values.startDate || null,
      endDate: values.endDate || null,
      accommodation: values.accommodation.trim() || null,
      transportNotes: values.transportNotes.trim() || null,
      maxAltitudeMetres:
        values.maxAltitudeMetres === '' ? null : Number(values.maxAltitudeMetres),
    };

    try {
      if (editing === 'new') {
        await bookingsService.addSegment(booking.id, payload);
        toast.success('Segment added.');
      } else {
        await bookingsService.updateSegment(booking.id, editing.id, payload);
        toast.success('Segment updated.');
      }
      setEditing(null);
      await onChange();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await bookingsService.deleteSegment(booking.id, deleting.id);
      setDeleting(null);
      await onChange();
      toast.success('Segment removed.');
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Move one segment up or down.
   *
   * The API renumbers from a complete ordered list rather than accepting a swap,
   * so the whole order is sent every time. That is also why a partial list is
   * rejected — half an ordering has no sensible meaning.
   */
  async function move(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= segments.length) return;

    const reordered = [...segments];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    setBusy(true);
    try {
      await bookingsService.reorderSegments(
        booking.id,
        reordered.map((segment) => segment.id)
      );
      await onChange();
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setBusy(false);
    }
  }

  const destinationOptions = destinations.map((destination) => ({
    value: destination.id,
    label: `${destination.name} (${destination.code})`,
  }));

  return (
    <Card
      title="Itinerary"
      subtitle={segments.length > 0 ? `${segments.length} segment(s)` : undefined}
      actions={
        canEdit && (
          <Button size="small" onClick={openNew}>
            Add segment
          </Button>
        )
      }
      padded={segments.length === 0}
    >
      {segments.length === 0 ? (
        <EmptyState
          title="No itinerary yet"
          message="Add the destinations this trip visits. Document requirements are worked out from these."
          action={canEdit && <Button onClick={openNew}>Add the first segment</Button>}
        />
      ) : (
        <ol className="segment-list">
          {segments.map((segment, index) => (
            <li key={segment.id} className="segment">
              <div className="segment__index">{segment.sequence}</div>

              <div className="segment__body">
                <div className="segment__heading">
                  <strong>{segment.title}</strong>
                  <span className="muted">
                    {segment.destination ? segment.destination.name : ''}
                  </span>
                </div>

                <p className="segment__dates muted">
                  {segment.startDate || segment.endDate
                    ? `${formatDate(segment.startDate)} → ${formatDate(segment.endDate)}`
                    : 'Dates not set'}
                  {segment.maxAltitudeMetres
                    ? ` · up to ${segment.maxAltitudeMetres.toLocaleString()} m`
                    : ''}
                </p>

                {segment.accommodation && (
                  <p className="segment__detail muted">Stay: {segment.accommodation}</p>
                )}
                {segment.description && <p className="segment__detail">{segment.description}</p>}
              </div>

              {canEdit && (
                <div className="segment__actions">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0 || busy}
                    aria-label="Move earlier"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => move(index, 1)}
                    disabled={index === segments.length - 1 || busy}
                    aria-label="Move later"
                  >
                    ↓
                  </button>
                  <Button size="small" variant="ghost" onClick={() => openEdit(segment)}>
                    Edit
                  </Button>
                  <Button size="small" variant="ghost" onClick={() => setDeleting(segment)}>
                    Delete
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      <Modal
        open={Boolean(editing)}
        title={editing === 'new' ? 'Add a segment' : 'Edit segment'}
        onClose={() => setEditing(null)}
      >
        <form onSubmit={handleSave} noValidate>
          {error && !error.details && <ErrorNotice error={error} />}

          <FieldGrid>
            <SelectField
              label="Destination"
              required
              value={values.destinationId}
              onChange={set('destinationId')}
              error={fieldError('destinationId')}
              placeholder="Choose…"
              options={destinationOptions}
            />
            <TextField
              label="Title"
              required
              value={values.title}
              onChange={set('title')}
              error={fieldError('title')}
              placeholder="Lukla to Everest Base Camp"
            />
          </FieldGrid>

          <FieldGrid columns={3}>
            <TextField
              label="Start"
              type="date"
              value={values.startDate}
              onChange={set('startDate')}
              error={fieldError('startDate')}
            />
            <TextField
              label="End"
              type="date"
              value={values.endDate}
              onChange={set('endDate')}
              error={fieldError('endDate')}
            />
            <TextField
              label="Max altitude (m)"
              type="number"
              min="0"
              value={values.maxAltitudeMetres}
              onChange={set('maxAltitudeMetres')}
              error={fieldError('maxAltitudeMetres')}
              hint="Insurance cover is checked against this."
            />
          </FieldGrid>

          <TextField
            label="Accommodation"
            value={values.accommodation}
            onChange={set('accommodation')}
            error={fieldError('accommodation')}
            placeholder="Teahouses"
          />
          <TextArea
            label="Description"
            value={values.description}
            onChange={set('description')}
            error={fieldError('description')}
          />
          <TextArea
            label="Transport notes"
            rows={2}
            value={values.transportNotes}
            onChange={set('transportNotes')}
            error={fieldError('transportNotes')}
          />

          <div className="form-actions">
            <Button onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleting)}
        title="Delete this segment?"
        message={`"${deleting?.title}" will be removed and the rest of the itinerary renumbered.`}
        confirmLabel="Delete"
        loading={busy}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </Card>
  );
}
