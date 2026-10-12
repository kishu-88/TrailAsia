import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import ErrorNotice from '../../components/common/ErrorNotice.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import TravellerLayout from '../../components/layout/TravellerLayout.jsx';
import TripDocuments from '../../features/traveller/TripDocuments.jsx';
import TripItinerary from '../../features/traveller/TripItinerary.jsx';
import TripOverview from '../../features/traveller/TripOverview.jsx';
import TripSafety from '../../features/traveller/TripSafety.jsx';
import { getBooking } from '../../services/bookings.service.js';
import { getChecklist, getTraveller } from '../../services/travellers.service.js';

/**
 * The traveller-facing view of one booking.
 *
 * The staff preview, at /preview/trip/:bookingId/:travellerId. It renders the
 * same components as the traveller's own screen but reads from the staff API,
 * so a coordinator can answer "what does it say on your end?" without asking
 * the traveller to read it out.
 *
 * The safety controls stay inert here. Location sharing and SOS belong to the
 * traveller's session, and a consultant must not be able to consent, or raise
 * an alert, on somebody else's behalf from a preview screen. The live version
 * is MyTripPage.
 */
export default function TravellerTripPage() {
  const { bookingId, travellerId } = useParams();

  const [booking, setBooking] = useState(null);
  const [traveller, setTraveller] = useState(null);
  const [checklist, setChecklist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('trip');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bookingData, travellerData] = await Promise.all([
        getBooking(bookingId),
        getTraveller(travellerId),
      ]);
      setBooking(bookingData);
      setTraveller(travellerData);

      // Requirements come from the destinations this trip actually visits, and
      // the altitude from its highest segment — the same basis the staff
      // readiness view uses, so the two can never disagree.
      const destinationIds = [
        ...new Set((bookingData.segments || []).map((segment) => segment.destinationId)),
      ];

      if (destinationIds.length > 0) {
        const maxAltitude = (bookingData.segments || []).reduce(
          (highest, segment) => Math.max(highest, segment.maxAltitudeMetres || 0),
          0
        );
        const response = await getChecklist(travellerId, {
          destinationIds,
          departureDate: bookingData.departureDate || undefined,
          returnDate: bookingData.returnDate || undefined,
          maxAltitudeMetres: maxAltitude || undefined,
        });
        setChecklist(response.data);
      } else {
        setChecklist(null);
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [bookingId, travellerId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Spinner block label="Loading your trip…" />;
  if (error) return <ErrorNotice error={error} onRetry={load} />;
  if (!booking || !traveller) return null;

  return (
    <TravellerLayout
      booking={booking}
      traveller={traveller}
      activeTab={tab}
      onTabChange={setTab}
      outstandingCount={checklist?.summary?.outstanding ?? 0}
    >
      {tab === 'trip' && (
        <>
          <TripOverview
            booking={booking}
            traveller={traveller}
            checklist={checklist}
            onGoToDocuments={() => setTab('documents')}
          />
          <TripItinerary segments={booking.segments} />
        </>
      )}

      {tab === 'documents' && <TripDocuments checklist={checklist} />}

      {tab === 'safety' && <TripSafety traveller={traveller} booking={booking} />}

      {tab === 'help' && (
        <>
          <div className="t-card">
            <div className="t-card__header">
              <h2 className="t-card__title">Getting help</h2>
            </div>
            <div className="t-card__body">
              <p>
                Your coordinator{booking.coordinator ? `, ${booking.coordinator.fullName},` : ''}{' '}
                is your first point of contact for anything about this trip.
              </p>
              <p className="muted" style={{ marginTop: 'var(--space-3)' }}>
                The Sydney office closes at 5pm AEST — around 11:30am in Kathmandu. Overnight
                enquiries are the gap the after-hours chatbot is meant to close.
              </p>
            </div>
          </div>

          <div className="t-unbuilt">
            <span className="t-unbuilt__label">Not built</span>
            In-app messaging and the after-hours chatbot. Release 1 scope, and the chatbot
            cannot ship until its safety escalation has been tested against deliberately
            constructed emergency scenarios — a go/no-go gate in Section 6.1 of the business
            case.
          </div>

          <div className="t-card">
            <div className="t-card__header">
              <h2 className="t-card__title">In an emergency overseas</h2>
            </div>
            <div className="t-card__body">
              <p>
                Australians can reach the Department of Foreign Affairs and Trade&rsquo;s 24-hour
                Consular Emergency Centre. Local emergency services come first; consular
                assistance is for what follows.
              </p>
            </div>
          </div>
        </>
      )}
    </TravellerLayout>
  );
}
