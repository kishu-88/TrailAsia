/**
 * Shown when a list has nothing in it.
 *
 * Distinguishing "nothing here yet" from "nothing matched your filters" matters:
 * the first needs a create button, the second needs a way back out of the filter.
 */
export default function EmptyState({ title, message, action }) {
  return (
    <div className="empty-state">
      <p className="empty-state__title">{title}</p>
      {message && <p className="muted">{message}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}
