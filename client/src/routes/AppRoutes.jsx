import { Navigate, Route, Routes } from 'react-router-dom';

import AppLayout from '../components/layout/AppLayout.jsx';
import BookingDetailPage from '../pages/BookingDetailPage.jsx';
import BookingsListPage from '../pages/BookingsListPage.jsx';
import DashboardPage from '../pages/DashboardPage.jsx';
import DestinationDetailPage from '../pages/DestinationDetailPage.jsx';
import DestinationsListPage from '../pages/DestinationsListPage.jsx';
import EmailLogsPage from '../pages/EmailLogsPage.jsx';
import LoginPage from '../pages/LoginPage.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';
import OperatorDetailPage from '../pages/OperatorDetailPage.jsx';
import OperatorsPage from '../pages/OperatorsPage.jsx';
import PaymentsPage from '../pages/PaymentsPage.jsx';
import ReportsPage from '../pages/ReportsPage.jsx';
import SafetyPage from '../pages/SafetyPage.jsx';
import SosLogPage from '../pages/SosLogPage.jsx';
import StaffPage from '../pages/StaffPage.jsx';
import TasksPage from '../pages/TasksPage.jsx';
import TravellerDetailPage from '../pages/TravellerDetailPage.jsx';
import TravellersListPage from '../pages/TravellersListPage.jsx';
import MyTripPage from '../pages/traveller/MyTripPage.jsx';
import TravellerActivatePage from '../pages/traveller/TravellerActivatePage.jsx';
import TravellerSignInPage from '../pages/traveller/TravellerSignInPage.jsx';
import TravellerTripPage from '../pages/traveller/TravellerTripPage.jsx';
import OperatorLayout from '../components/layout/OperatorLayout.jsx';
import OperatorActivatePage from '../pages/operator/OperatorActivatePage.jsx';
import OperatorPortalPage from '../pages/operator/OperatorPortalPage.jsx';
import OperatorSignInPage from '../pages/operator/OperatorSignInPage.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import OperatorRoute from './OperatorRoute.jsx';
import OperatorSession from './OperatorSession.jsx';
import TravellerRoute from './TravellerRoute.jsx';
import TravellerSession from './TravellerSession.jsx';

/**
 * Three applications, three sessions, one build.
 *
 * Everything under `/trip` belongs to the traveller and is gated by
 * TravellerRoute, which only a traveller's own session satisfies. Everything
 * under `/operator` belongs to a ground operator and is gated the same way by
 * OperatorRoute. Everything else is the staff portal behind ProtectedRoute.
 * The preview at `/preview/trip/...` is the one place the staff and traveller
 * apps meet: it renders the traveller's screens from the staff API, with the
 * safety controls inert.
 */
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* --- Traveller app -------------------------------------------------- */}

      <Route element={<TravellerSession />}>
        <Route path="/trip/sign-in" element={<TravellerSignInPage />} />
        <Route path="/trip/activate" element={<TravellerActivatePage />} />

        <Route element={<TravellerRoute />}>
          <Route path="/trip" element={<MyTripPage />} />
          <Route path="/trip/:bookingId" element={<MyTripPage />} />
        </Route>
      </Route>

      {/* --- Operator portal -------------------------------------------------- */}

      <Route element={<OperatorSession />}>
        <Route path="/operator/sign-in" element={<OperatorSignInPage />} />
        <Route path="/operator/activate" element={<OperatorActivatePage />} />

        <Route element={<OperatorRoute />}>
          <Route element={<OperatorLayout />}>
            <Route path="/operator" element={<OperatorPortalPage />} />
          </Route>
        </Route>
      </Route>

      {/* --- Staff portal --------------------------------------------------- */}

      {/* The traveller's screens as staff see them. Outside AppLayout so it
          keeps the phone-shaped shell rather than the sidebar. */}
      <Route element={<ProtectedRoute />}>
        <Route
          path="/preview/trip/:bookingId/:travellerId"
          element={<TravellerTripPage />}
        />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />

          <Route path="/bookings" element={<BookingsListPage />} />
          <Route path="/bookings/:id" element={<BookingDetailPage />} />

          {/* Readable by every staff role, including finance — "what is still
              outstanding on this departure" is a reconciliation question too.
              The server decides who may own or move a task. */}
          <Route path="/tasks" element={<TasksPage />} />

          <Route path="/travellers" element={<TravellersListPage />} />
          <Route path="/travellers/:id" element={<TravellerDetailPage />} />

          {/* Readable by every staff role — finance reconciles against operator
              costs. The server restricts who may raise or answer a request, and
              who may curate the directory. */}
          <Route path="/operators" element={<OperatorsPage />} />
          <Route path="/operators/:id" element={<OperatorDetailPage />} />

          {/* Readable by every staff role. A consultant who cannot see whether
              their traveller has paid will ring finance to ask, which is the
              phone call this module exists to remove. The server decides who
              may write to the ledger, and it is not them. */}
          <Route path="/payments" element={<PaymentsPage />} />

          {/* Every staff role reads both tabs. The operational tab is the
              agency's early-warning system, and a warning only some people can
              see is not one. The consultant performance table filters itself to
              the reader's own row on the server. */}
          <Route path="/reports" element={<ReportsPage />} />

          <Route path="/destinations" element={<DestinationsListPage />} />
          <Route path="/destinations/:id" element={<DestinationDetailPage />} />

          {/* Every staff role can read the safety desk; the server decides who
              may act on an alert. An SOS nobody in the office can see is the
              failure this module exists to prevent. */}
          <Route path="/safety" element={<SafetyPage />} />
          {/* What happened to each alert, and who did it. Same audience as
              the desk itself: every staff role. */}
          <Route path="/safety/log" element={<SosLogPage />} />

          {/* Admin-only. The server refuses these calls regardless of the
              guard — this just keeps the wrong screen from rendering at all. */}
          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="/staff" element={<StaffPage />} />
            <Route path="/email-log" element={<EmailLogsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
