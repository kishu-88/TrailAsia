import { useCallback, useEffect, useRef, useState } from 'react';

import {
  cancelSos,
  getSafetySummary,
  raiseSos,
  sendPing,
  setLocationConsent,
} from '../../services/safety.service.js';

/**
 * The working half of the safety screen: consent, location sharing and SOS.
 *
 * Three decisions are worth reading before changing anything here.
 *
 * Sharing is off until the traveller turns it on, and the switch says so in
 * plain words. A safety feature that arrives already enabled is surveillance,
 * and a traveller who does not trust the off switch will not trust the on one.
 *
 * The SOS needs two presses. Not a confirm dialog — a browser dialog blocks the
 * page and is easy to dismiss by accident — but a button that changes into a
 * second, differently worded button for a few seconds. One press is too easy in
 * a pocket; a dialog is too easy to dismiss in a panic.
 *
 * Position is read from the browser only at the moment it is needed, never on a
 * timer. Continuous background tracking needs a native app and a battery budget
 * neither of which exists yet, and pretending otherwise on a web page would
 * produce a map that silently stops updating when the screen locks.
 */

const GEO_OPTIONS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 };

function readPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This device cannot report its position.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
          accuracyMetres: position.coords.accuracy
            ? Math.round(position.coords.accuracy)
            : undefined,
          altitudeMetres:
            position.coords.altitude !== null && position.coords.altitude !== undefined
              ? Math.round(position.coords.altitude)
              : undefined,
        }),
      (error) => reject(new Error(error.message || 'Could not get your position.')),
      GEO_OPTIONS
    );
  });
}

function whenText(value) {
  if (!value) return null;
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export default function SafetyControls({ bookingId }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  const [armed, setArmed] = useState(false);
  const armTimer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await getSafetySummary(bookingId));
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    load();
    return () => {
      if (armTimer.current) clearTimeout(armTimer.current);
    };
  }, [load]);

  async function toggleConsent(granted) {
    setBusy('consent');
    setMessage(null);
    try {
      await setLocationConsent(bookingId, granted);
      await load();
      setMessage({
        tone: 'info',
        text: granted
          ? 'Sharing is on. Your position is sent only when you tap Update.'
          : 'Sharing is off. Nothing more will be recorded.',
      });
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    } finally {
      setBusy(null);
    }
  }

  async function shareNow() {
    setBusy('ping');
    setMessage(null);
    try {
      const position = await readPosition();
      await sendPing(bookingId, position);
      await load();
      setMessage({ tone: 'info', text: 'Position sent.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    } finally {
      setBusy(null);
    }
  }

  function armSos() {
    setArmed(true);
    // Disarms itself, so a button left armed in a pocket does not stay armed.
    armTimer.current = setTimeout(() => setArmed(false), 8000);
  }

  async function confirmSos() {
    if (armTimer.current) clearTimeout(armTimer.current);
    setBusy('sos');
    setMessage(null);

    // The position is a best effort and the alert is raised either way. An SOS
    // that fails because the phone could not get a fix is the worst possible
    // failure mode for this feature.
    let position = {};
    try {
      position = await readPosition();
    } catch {
      position = {};
    }

    try {
      await raiseSos(bookingId, position);
      await load();
      setArmed(false);
      setMessage({
        tone: 'info',
        text: 'Alert sent. The agency can see it now. Keep your phone with you.',
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: `${error.message} If you cannot get through, call local emergency services.`,
      });
    } finally {
      setBusy(null);
    }
  }

  async function withdrawSos() {
    setBusy('cancel');
    try {
      await cancelSos(summary.openAlert.id);
      await load();
      setMessage({ tone: 'info', text: 'Alert withdrawn.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="muted">Loading your safety settings…</p>;
  if (!summary) return null;

  const sharing = summary.consent.granted;
  const openAlert = summary.openAlert;

  return (
    <>
      {/* --- SOS ----------------------------------------------------------- */}

      {openAlert ? (
        <div className="t-banner t-banner--action">
          <p className="t-banner__title">
            {openAlert.status === 'acknowledged'
              ? 'The agency has seen your alert'
              : 'Your alert has been sent'}
          </p>
          <p>
            Raised {whenText(openAlert.raisedAt)}.{' '}
            {openAlert.status === 'acknowledged'
              ? 'Someone at the office is working on it.'
              : 'It is waiting to be picked up.'}
          </p>
          <button
            type="button"
            className="t-action"
            style={{ marginTop: 'var(--space-3)' }}
            onClick={withdrawSos}
            disabled={busy === 'cancel'}
          >
            <span className="t-action__body">
              <span className="t-action__label">
                {busy === 'cancel' ? 'Withdrawing…' : 'I am fine — withdraw this alert'}
              </span>
              <span className="t-action__hint">Only do this if you no longer need help.</span>
            </span>
          </button>
        </div>
      ) : (
        <>
          {armed ? (
            <button
              type="button"
              className="t-action t-action--sos t-action--sos-armed"
              onClick={confirmSos}
              disabled={busy === 'sos'}
            >
              {busy === 'sos' ? 'Sending…' : 'Tap again to send an SOS'}
            </button>
          ) : (
            <button type="button" className="t-action t-action--sos" onClick={armSos}>
              SOS — I need help
            </button>
          )}
          <p className="t-note">
            Two taps, so it cannot go off in your pocket. Local emergency services are still
            faster than we are — call them first if you can.
          </p>
        </>
      )}

      {message && (
        <div
          className={`alert alert--${message.tone === 'error' ? 'error' : 'info'}`}
          role="status"
        >
          {message.text}
        </div>
      )}

      {/* --- Location sharing ---------------------------------------------- */}

      <div className="t-card">
        <div className="t-card__header">
          <h2 className="t-card__title">Location sharing</h2>
          <span className={`badge badge--${sharing ? 'success' : 'neutral'}`}>
            {sharing ? 'On' : 'Off'}
          </span>
        </div>

        <div className="t-card__body">
          <p>{summary.consentStatement}</p>

          {sharing ? (
            <>
              <div className="t-row">
                <span className="t-row__label">Last position sent</span>
                <span className="t-row__value">
                  {summary.lastSeen ? whenText(summary.lastSeen.recordedAt) : 'Not yet'}
                </span>
              </div>

              <button
                type="button"
                className="t-action t-action--primary"
                onClick={shareNow}
                disabled={busy === 'ping'}
              >
                <span className="t-action__icon" aria-hidden="true">📍</span>
                <span className="t-action__body">
                  <span className="t-action__label">
                    {busy === 'ping' ? 'Getting your position…' : 'Update my position now'}
                  </span>
                  <span className="t-action__hint">
                    Sent once, when you tap. Nothing is recorded in between.
                  </span>
                </span>
              </button>

              <button
                type="button"
                className="t-action"
                onClick={() => toggleConsent(false)}
                disabled={busy === 'consent'}
              >
                <span className="t-action__body">
                  <span className="t-action__label">Stop sharing my location</span>
                </span>
              </button>
            </>
          ) : (
            <button
              type="button"
              className="t-action t-action--primary"
              onClick={() => toggleConsent(true)}
              disabled={busy === 'consent'}
            >
              <span className="t-action__icon" aria-hidden="true">📍</span>
              <span className="t-action__body">
                <span className="t-action__label">Turn on location sharing</span>
                <span className="t-action__hint">
                  You can turn it off again at any time, from this screen.
                </span>
              </span>
            </button>
          )}

          <p className="t-note">
            Position records are deleted {summary.retentionDays} days after your trip ends.
            Pressing SOS sends your position whether sharing is on or off.
          </p>
        </div>
      </div>

      <div className="t-unbuilt">
        <span className="t-unbuilt__label">Not built</span>
        Automatic background tracking and scam alerts. Sharing is manual for now: the position
        goes out when you tap, not on a timer. Continuous tracking needs a native app, and a web
        page that claimed to do it would quietly stop the moment your screen locked.
      </div>
    </>
  );
}
