import { useCallback, useEffect, useState } from 'react';

import Button from '../../components/common/Button.jsx';
import { listAlertEvents } from '../../services/safety.service.js';
import { formatDateTime } from '../../utils/format.js';
import { sosActorName, sosEventSentence } from './sosEvents.js';

/**
 * One alert's history, on its card on the safety desk.
 *
 * Closed until asked for: the desk is for acting on what is open, and a
 * timeline under every card would bury the buttons. Loaded when opened and
 * again whenever `version` changes — the desk passes the alert's status and
 * assignee, so acknowledging or handing an alert over refreshes the history
 * that is already on screen rather than leaving it a step behind.
 */
export default function AlertHistory({ alertId, version }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setEvents(await listAlertEvents(alertId));
      setError(null);
    } catch (caught) {
      setError(caught.message);
    }
  }, [alertId]);

  useEffect(() => {
    if (open) load();
  }, [open, version, load]);

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <Button size="small" variant="ghost" onClick={() => setOpen((value) => !value)}>
        {open ? 'Hide history' : 'Show history'}
      </Button>

      {open && error && <p className="muted">Could not load the history: {error}</p>}
      {open && !error && !events && <p className="muted">Loading…</p>}

      {open && events && (
        <ol className="task-trail" style={{ marginTop: 'var(--space-3)' }}>
          {events.map((event) => (
            <li key={event.id} className="task-trail__item">
              <p className="task-trail__line">
                <strong>{sosActorName(event)}</strong> {sosEventSentence(event)}
                <span className="task-trail__when">{formatDateTime(event.createdAt)}</span>
              </p>
              {event.detail && <p className="task-trail__note">{event.detail}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
