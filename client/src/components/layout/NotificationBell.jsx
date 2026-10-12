import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/notifications.service.js';

/**
 * The bell in the top bar.
 *
 * Polling, not a websocket. The agency is 25 people and the event rate is a
 * handful a day; a socket would add a connection that can silently drop and a
 * reconnection path nobody would notice was broken. Sixty seconds is late enough
 * to be cheap and soon enough that an SOS raised while somebody is at their desk
 * reaches them before they would have found it any other way.
 *
 * The count is polled on its own — one small query — and the list is only
 * fetched when the panel is opened. A closed bell costs a count, not a feed.
 */
const POLL_INTERVAL_MS = 60000;

const SEVERITY_LABEL = { urgent: 'Urgent', warning: 'Needs attention', info: '' };

function metaLine(notification) {
  return [SEVERITY_LABEL[notification.severity], notification.actor?.fullName]
    .filter(Boolean)
    .join(' · ');
}

function timeAgo(value) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export default function NotificationBell() {
  const navigate = useNavigate();

  const [counts, setCounts] = useState({ unread: 0, urgent: 0 });
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);

  const refreshCounts = useCallback(async () => {
    try {
      setCounts(await getUnreadCount());
    } catch {
      // A failing bell must not put an error on every screen. It goes quiet.
    }
  }, []);

  useEffect(() => {
    refreshCounts();
    const timer = setInterval(refreshCounts, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refreshCounts]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await listNotifications({ perPage: 12 });
      setItems(response.data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Close on Escape and on a click outside — a panel that can only be dismissed
  // by hitting the bell again is a panel people leave open by accident.
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) loadItems();
  }

  async function handleOpenItem(notification) {
    setOpen(false);
    if (!notification.read) {
      try {
        await markNotificationRead(notification.id);
        refreshCounts();
      } catch {
        // Navigating matters more than the read flag; the next poll will correct it.
      }
    }
    if (notification.link) navigate(notification.link);
  }

  async function handleMarkAll() {
    try {
      await markAllNotificationsRead();
      await Promise.all([refreshCounts(), loadItems()]);
    } catch {
      // Same reasoning as above — the bell stays quiet when it cannot talk.
    }
  }

  const badge = counts.unread > 9 ? '9+' : String(counts.unread);

  return (
    <div className="bell" ref={containerRef}>
      <button
        type="button"
        className={`bell__button${counts.urgent > 0 ? ' bell__button--urgent' : ''}`}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={
          counts.unread === 0
            ? 'Notifications'
            : `Notifications — ${counts.unread} unread${
                counts.urgent > 0 ? `, ${counts.urgent} urgent` : ''
              }`
        }
      >
        <span aria-hidden="true">🔔</span>
        {counts.unread > 0 && (
          <span
            className={`bell__badge${counts.urgent > 0 ? ' bell__badge--urgent' : ''}`}
            aria-hidden="true"
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="bell__panel" role="dialog" aria-label="Notifications">
          <header className="bell__header">
            <span className="bell__title">Notifications</span>
            {counts.unread > 0 && (
              <button type="button" className="bell__mark-all" onClick={handleMarkAll}>
                Mark all read
              </button>
            )}
          </header>

          {loading && <p className="bell__empty">Loading…</p>}

          {!loading && items.length === 0 && (
            <p className="bell__empty">
              Nothing yet. Alerts, tasks assigned to you and document decisions appear here.
            </p>
          )}

          {!loading && items.length > 0 && (
            <ul className="bell__list">
              {items.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    className={`bell__item${notification.read ? '' : ' bell__item--unread'} bell__item--${notification.severity}`}
                    onClick={() => handleOpenItem(notification)}
                  >
                    <span className="bell__item-head">
                      <span className="bell__item-title">{notification.title}</span>
                      <span className="bell__item-when">{timeAgo(notification.createdAt)}</span>
                    </span>
                    {notification.body && (
                      <span className="bell__item-body">{notification.body}</span>
                    )}
                    {/* Attribution only when a member of staff caused it. A
                        null actor covers two different things — a traveller
                        pressing SOS and the overdue sweep — and a single word
                        standing in for both would be wrong about one of them.
                        The title already says what happened. */}
                    {metaLine(notification) && (
                      <span className="bell__item-meta">{metaLine(notification)}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
