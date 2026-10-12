import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import ErrorNotice from '../../components/common/ErrorNotice.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import TravellerLayout from '../../components/layout/TravellerLayout.jsx';
import TripDocuments from '../../features/traveller/TripDocuments.jsx';
import TripItinerary from '../../features/traveller/TripItinerary.jsx';
import TripOverview from '../../features/traveller/TripOverview.jsx';
import TripSafety from '../../features/traveller/TripSafety.jsx';
import { useTravellerAuth } from '../../context/TravellerAuthContext.jsx';
import { getTrip, listTrips, uploadDocument } from '../../services/travellerAuth.service.js';

/**
 * The traveller's own view of their trip, behind their own session.
 *
 * The staff preview at /preview/trip/:bookingId/:travellerId renders the same
 * components from the staff API. This one takes nothing from the URL except
 * which of *their* trips to show — the identity comes from the session, so
 * there is no id here for anyone to change.
 */
export default function MyTripPage() {
  const { bookingId: bookingIdParam } = useParams();
  const navigate = useNavigate();
  const { traveller: sessionTraveller, logout } = useTravellerAuth();

  const [bookingId, setBookingId] = useState(bookingIdParam || null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('trip');

  // `quiet` reloads the data behind the screen that is already showing. After
  // an upload the page must not flash to a spinner and back: that would throw
  // away the Documents tab's own state, including the "Sent" confirmation the
  // traveller is waiting to see.
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      let id = bookingIdParam;

      if (!id) {
        // No trip named: show the next one to depart, which is the only trip a
        // traveller is thinking about when they open this.
        const trips = await listTrips();
        if (trips.length === 0) {
          setData(null);
          setBookingId(null);
          return;
        }
        id = trips[0].id;
      }

      setBookingId(id);
      setData(await getTrip(id));
    } catch (caught) {
      // A failed background refresh leaves the screen as it was. Replacing a
      // working page with an error because a re-read failed would hide the
      // confirmation of the upload that just succeeded.
      if (!quiet) setError(caught);
    } finally {
      setLoading(false);
    }
  }, [bookingIdParam]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpload(fields, file) {
    await uploadDocument(fields, file);
    await load({ quiet: true });
  }

  async function handleSignOut() {
    await logout();
    navigate('/trip/sign-in', { replace: true });
  }

  if (loading) return <Spinner block label="Loading your trip…" />;
  if (error) return <ErrorNotice error={error} onRetry={() => load()} />;

  if (!data) {
    return (
      <div className="traveller-app">
        <div className="traveller-frame traveller-frame--auth">
          <header className="traveller-auth__header">
            <h1 className="traveller-auth__title">
              {sessionTraveller ? `Hello, ${sessionTraveller.firstName}` : 'Your trips'}
            </h1>
          </header>
          <p className="traveller-auth__note">
            There is no trip on your account yet. Once your booking is confirmed it will appear
            here.
          </p>
          <button type="button" className="t-action" onClick={handleSignOut}>
            <span className="t-action__body">
              <span className="t-action__label">Sign out</span>
            </span>
          </button>
        </div>
      </div>
    );
  }

  const { trip, traveller, checklist } = data;

  return (
    <TravellerLayout
      mode="traveller"
      booking={trip}
      traveller={traveller}
      activeTab={tab}
      onTabChange={setTab}
      outstandingCount={checklist?.summary?.outstanding ?? 0}
      onSignOut={handleSignOut}
    >
      {tab === 'trip' && (
        <>
          <TripOverview
            booking={trip}
            traveller={traveller}
            checklist={checklist}
            onGoToDocuments={() => setTab('documents')}
          />
          <TripItinerary segments={trip.segments} />
        </>
      )}

      {tab === 'documents' && (
        <TripDocuments
          checklist={checklist}
          documents={traveller.documents}
          onUpload={handleUpload}
        />
      )}

      {tab === 'safety' && (
        <TripSafety traveller={traveller} booking={trip} bookingId={bookingId} live />
      )}

      {tab === 'help' && (
        <>
          <div className="t-card">
            <div className="t-card__header">
              <h2 className="t-card__title">Getting help</h2>
            </div>
            <div className="t-card__body">
              <p>
                Your coordinator{trip.coordinator ? `, ${trip.coordinator.fullName},` : ''} is
                your first point of contact for anything about this trip.
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
                Local emergency services come first. Australians can then reach the Department
                of Foreign Affairs and Trade&rsquo;s 24-hour Consular Emergency Centre;
                consular assistance is for what follows.
              </p>
            </div>
          </div>

          <button type="button" className="t-action" onClick={handleSignOut}>
            <span className="t-action__body">
              <span className="t-action__label">Sign out</span>
            </span>
          </button>
        </>
      )}
    </TravellerLayout>
  );
}
