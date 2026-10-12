import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/operatorAuth.service.js';

/**
 * The operator portal's own bell — same polling shape as the staff one
 * (see components/layout/NotificationBell.jsx), scaled down to what an
 * operator needs: no severity styling beyond unread, no navigation, since
 * everything it lists is "a confirmation needs your answer" and the operator
 * is already looking at the list of confirmations below it.
 */
const POLL_INTERVAL_MS = 60000;

export default function OperatorNotificationBell({ onNotified }) {
  const [counts, setCounts] = useState({ unread: 0 });
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);

  const refreshCounts = useCallback(async () => {
    try {
      setCounts(await getUnreadNotificationCount());
    } catch {
      // A failing bell must not put an error on the page. It goes quiet.
    }
  }, []);

  useEffect(() => {
    refreshCounts();
    const timer = setInterval(refreshCounts, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refreshCounts]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      try {
        const response = await listNotifications({ perPage: 12 });
        setItems(response.data || []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleItemClick(notification) {
    if (!notification.read) {
      try {
        await markNotificationRead(notification.id);
        refreshCounts();
      } catch {
        // The next poll corrects it.
      }
    }
    setOpen(false);
    onNotified?.();
  }

  async function handleMarkAll() {
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((item) => ({ ...item, read: true })));
      refreshCounts();
    } catch {
      // Leave the badge as-is; the operator can try again.
    }
  }

  return (
    <div className="bell" ref={containerRef}>
      <button
        type="button"
        className="bell__button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={counts.unread === 0 ? 'Notifications' : `Notifications — ${counts.unread} unread`}
      >
        <span aria-hidden="true">🔔</span>
        {counts.unread > 0 && (
          <span className="bell__badge" aria-hidden="true">
            {counts.unread > 9 ? '9+' : counts.unread}
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
          {!loading && items.length === 0 && <p className="bell__empty">Nothing yet.</p>}
          {!loading && items.length > 0 && (
            <ul className="bell__list">
              {items.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    className={`bell__item${notification.read ? '' : ' bell__item--unread'}`}
                    onClick={() => handleItemClick(notification)}
                  >
                    <span className="bell__item-title">{notification.title}</span>
                    {notification.body && (
                      <span className="bell__item-body">{notification.body}</span>
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
