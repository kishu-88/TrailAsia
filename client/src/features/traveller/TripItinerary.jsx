import { formatDate } from '../../utils/format.js';

/** The trip as a vertical timeline — the shape a traveller reads it in. */
export default function TripItinerary({ segments }) {
  if (!segments || segments.length === 0) {
    return (
      <div className="t-card">
        <div className="t-card__body">
          <p className="muted">Your itinerary is still being put together.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="t-card">
      <div className="t-card__header">
        <h2 className="t-card__title">Your itinerary</h2>
      </div>

      <ol className="t-timeline">
        {segments.map((segment, index) => (
          <li key={segment.id} className="t-leg">
            <div className="t-leg__marker">
              <span className="t-leg__dot">{segment.sequence}</span>
              {index < segments.length - 1 && <span className="t-leg__line" />}
            </div>

            <div className="t-leg__body">
              <p className="t-leg__title">{segment.title}</p>
              <p className="t-leg__meta">
                {segment.destination?.name}
                {segment.startDate && ` · ${formatDate(segment.startDate)}`}
                {segment.endDate && ` – ${formatDate(segment.endDate)}`}
              </p>

              {segment.maxAltitudeMetres > 2500 && (
                <p className="t-leg__meta">
                  Reaches {segment.maxAltitudeMetres.toLocaleString()} m
                </p>
              )}

              {segment.accommodation && (
                <p className="t-leg__note">Staying: {segment.accommodation}</p>
              )}
              {segment.description && <p className="t-leg__note">{segment.description}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
