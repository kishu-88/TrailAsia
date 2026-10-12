import { formatDate } from '../../utils/format.js';

/**
 * The "what do I need to know right now" screen.
 *
 * Ordered by urgency rather than by data model: whether anything is blocking
 * departure comes first, then who to call, then the trip facts. A traveller
 * opening this two days out wants the first of those, not an itinerary.
 */
export default function TripOverview({ booking, traveller, checklist, onGoToDocuments }) {
  const outstanding = checklist?.summary?.outstanding ?? 0;
  const ready = checklist?.summary?.ready;
  const coordinator = booking.coordinator;

  const advisories = (booking.segments || [])
    .map((segment) => segment.destination)
    .filter(Boolean)
    .filter(
      (destination, index, all) =>
        all.findIndex((other) => other.id === destination.id) === index
    );

  return (
    <>
      {checklist && (
        <div className={`t-banner t-banner--${ready ? 'ready' : 'action'}`}>
          <p className="t-banner__title">
            {ready ? 'You are ready to travel' : `${outstanding} thing${outstanding === 1 ? '' : 's'} still needed`}
          </p>
          <p>
            {ready
              ? 'Everything your destinations require has been received and checked.'
              : 'Your coordinator needs these before you depart.'}
          </p>
          {!ready && (
            <button
              type="button"
              className="t-action"
              style={{ marginTop: 'var(--space-3)' }}
              onClick={onGoToDocuments}
            >
              <span className="t-action__icon" aria-hidden="true">📄</span>
              <span className="t-action__body">
                <span className="t-action__label">See what is outstanding</span>
              </span>
            </button>
          )}
        </div>
      )}

      {coordinator && (
        <div className="t-card">
          <div className="t-card__header">
            <h2 className="t-card__title">Your coordinator</h2>
          </div>
          <div className="t-row">
            <span className="t-row__label">Name</span>
            <span className="t-row__value">{coordinator.fullName}</span>
          </div>
          <div className="t-card__body">
            <div className="t-unbuilt">
              <span className="t-unbuilt__label">Not built</span>
              In-app messaging and the after-hours chatbot are Release 1 scope but have no
              backend yet. For now a traveller would contact the Sydney office directly.
            </div>
          </div>
        </div>
      )}

      <div className="t-card">
        <div className="t-card__header">
          <h2 className="t-card__title">Trip details</h2>
        </div>
        <div className="t-row">
          <span className="t-row__label">Departs</span>
          <span className="t-row__value">{formatDate(booking.departureDate)}</span>
        </div>
        <div className="t-row">
          <span className="t-row__label">Returns</span>
          <span className="t-row__value">{formatDate(booking.returnDate)}</span>
        </div>
        <div className="t-row">
          <span className="t-row__label">Party size</span>
          <span className="t-row__value">{booking.partySize}</span>
        </div>
        <div className="t-row">
          <span className="t-row__label">Reference</span>
          <span className="t-row__value mono">{booking.reference}</span>
        </div>
      </div>

      {advisories.some((destination) => destination.advisoryNotes) && (
        <div className="t-banner t-banner--advisory">
          <p className="t-banner__title">Before you go</p>
          {advisories
            .filter((destination) => destination.advisoryNotes)
            .map((destination) => (
              <p key={destination.id} style={{ marginTop: 'var(--space-2)' }}>
                <strong>{destination.name}:</strong> {destination.advisoryNotes}
              </p>
            ))}
        </div>
      )}
    </>
  );
}
