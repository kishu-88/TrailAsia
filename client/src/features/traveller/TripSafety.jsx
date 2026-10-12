import SafetyControls from './SafetyControls.jsx';
import { formatDate } from '../../utils/format.js';

/**
 * The safety screen — the reason the business case recommends building rather
 * than buying an off-the-shelf tour product.
 *
 * The single most useful thing here is the insurer's phone number sitting next
 * to the altitude the policy actually covers. Smartraveller records prosecuted
 * fraud in Nepal where operators pressed trekkers into unnecessary helicopter
 * evacuations while pretending to verify cover. A traveller who can see their
 * own policy limit and ring their own insurer, from a phone, at altitude, is
 * markedly harder to defraud than one relying on the person standing in front
 * of them.
 *
 * The consent, sharing and SOS controls only appear under a traveller's own
 * session (`live`). In the staff preview the SOS is rendered visibly inert
 * instead: a consultant demonstrating the app must not be able to raise a real
 * alert on their traveller's behalf, and a panic button that looks live but is
 * not would be worse than offering none at all.
 */
export default function TripSafety({ traveller, booking, bookingId, live = false }) {
  const documents = traveller.documents || [];
  const insurance = documents.find((document) => document.type === 'insurance');

  const tripAltitude = (booking.segments || []).reduce(
    (highest, segment) => Math.max(highest, segment.maxAltitudeMetres || 0),
    0
  );

  const coverShort =
    insurance?.altitudeCoverMetres && tripAltitude
      ? insurance.altitudeCoverMetres < tripAltitude
      : false;

  const emergency = traveller.emergencyContact;

  return (
    <>
      {live ? (
        <SafetyControls bookingId={bookingId || booking.id} />
      ) : (
        <>
          <button type="button" className="t-action t-action--sos" disabled>
            SOS — inactive in preview
          </button>
          <div className="t-unbuilt">
            <span className="t-unbuilt__label">Preview only</span>
            The SOS and location sharing work under the traveller&rsquo;s own sign-in, not
            through your staff session. Raising a real alert on somebody else&rsquo;s behalf
            from a preview screen is not something this should let you do.
          </div>
        </>
      )}

      {/* --- Insurance ---------------------------------------------------- */}

      {insurance ? (
        <>
          {coverShort && (
            <div className="t-banner t-banner--action">
              <p className="t-banner__title">Your cover may not reach this trip</p>
              <p>
                Your policy states cover to {insurance.altitudeCoverMetres.toLocaleString()} m.
                This trip reaches {tripAltitude.toLocaleString()} m. Speak to your coordinator
                before you depart.
              </p>
            </div>
          )}

          <div className="t-card">
            <div className="t-card__header">
              <h2 className="t-card__title">Your travel insurance</h2>
            </div>

            <div className="t-row">
              <span className="t-row__label">Insurer</span>
              <span className="t-row__value">{insurance.issuer || 'Not recorded'}</span>
            </div>
            <div className="t-row">
              <span className="t-row__label">Policy number</span>
              <span className="t-row__value mono">{insurance.reference || 'Not recorded'}</span>
            </div>
            <div className="t-row">
              <span className="t-row__label">Valid until</span>
              <span className="t-row__value">{formatDate(insurance.expiresOn)}</span>
            </div>
            <div className="t-row">
              <span className="t-row__label">Altitude cover</span>
              <span className="t-row__value">
                {insurance.altitudeCoverMetres
                  ? `${insurance.altitudeCoverMetres.toLocaleString()} m`
                  : 'Not stated'}
              </span>
            </div>
            {tripAltitude > 0 && (
              <div className="t-row">
                <span className="t-row__label">This trip reaches</span>
                <span className="t-row__value">{tripAltitude.toLocaleString()} m</span>
              </div>
            )}

            <div className="t-card__body">
              {insurance.insurerContactPhone ? (
                <a
                  className="t-action t-action--call"
                  href={`tel:${insurance.insurerContactPhone.replace(/\s/g, '')}`}
                >
                  <span className="t-action__icon" aria-hidden="true">📞</span>
                  <span className="t-action__body">
                    <span className="t-action__label">Call your insurer</span>
                    <span className="t-action__hint">{insurance.insurerContactPhone}</span>
                  </span>
                </a>
              ) : (
                <div className="t-unbuilt">
                  <span className="t-unbuilt__label">Missing</span>
                  No insurer emergency number is on file. Ask your coordinator to add one
                  before you depart — it is the number you would need in a hurry.
                </div>
              )}
            </div>
          </div>

          <div className="t-banner t-banner--advisory">
            <p className="t-banner__title">Before agreeing to a helicopter evacuation</p>
            <p>
              Call your insurer yourself using the number above and confirm the evacuation is
              covered. Do not rely on someone else telling you they have checked your policy.
              Australians trekking in Nepal have been pressured into evacuations they did not
              need and could not claim for.
            </p>
          </div>
        </>
      ) : (
        <div className="t-card">
          <div className="t-card__header">
            <h2 className="t-card__title">Your travel insurance</h2>
          </div>
          <div className="t-card__body">
            <p className="muted">
              No policy has been recorded yet. Send your insurance details to your coordinator
              — for trekking they need the policy number, the emergency contact number and the
              altitude your cover extends to.
            </p>
          </div>
        </div>
      )}

      {/* --- Emergency contact -------------------------------------------- */}

      <div className="t-card">
        <div className="t-card__header">
          <h2 className="t-card__title">Your emergency contact</h2>
        </div>
        {emergency ? (
          <>
            <div className="t-row">
              <span className="t-row__label">Name</span>
              <span className="t-row__value">{emergency.name}</span>
            </div>
            {emergency.relationship && (
              <div className="t-row">
                <span className="t-row__label">Relationship</span>
                <span className="t-row__value">{emergency.relationship}</span>
              </div>
            )}
            {emergency.phone && (
              <div className="t-card__body">
                <a
                  className="t-action"
                  href={`tel:${emergency.phone.replace(/\s/g, '')}`}
                >
                  <span className="t-action__icon" aria-hidden="true">📞</span>
                  <span className="t-action__body">
                    <span className="t-action__label">Call {emergency.name}</span>
                    <span className="t-action__hint">{emergency.phone}</span>
                  </span>
                </a>
              </div>
            )}
          </>
        ) : (
          <div className="t-card__body">
            <p className="muted">
              None recorded. Give your coordinator a name and number before you travel.
            </p>
          </div>
        )}
      </div>

      {/* --- Fair price guide ---------------------------------------------- */}

      <div className="t-card">
        <div className="t-card__header">
          <h2 className="t-card__title">Fair price guide</h2>
        </div>
        <div className="t-card__body">
          <div className="t-unbuilt">
            <span className="t-unbuilt__label">Not built</span>
            Local price ranges for taxis, guides and common purchases, sourced from the
            agency&rsquo;s contracted ground operators. Release 1 scope; there is no
            fair-price data model or endpoint yet.
          </div>
        </div>
      </div>
    </>
  );
}
