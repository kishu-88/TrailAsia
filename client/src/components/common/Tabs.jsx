import { useRef } from 'react';

/**
 * A tab strip.
 *
 * Built rather than borrowed because the accessible behaviour is the whole
 * point and it is about thirty lines. Tabs that are only clickable are a
 * keyboard trap for anyone who does not use a mouse: the pattern expects one
 * stop in the tab order, with left and right arrows moving between tabs. That
 * is what `tabIndex` and the key handler below do.
 *
 * @param {Array}    tabs      [{ id, label, badge }]
 * @param {string}   active    The selected tab's id.
 * @param {Function} onChange  Called with the newly selected id.
 */
export default function Tabs({ tabs, active, onChange, label = 'Views' }) {
  const refs = useRef({});

  function handleKeyDown(event) {
    const order = tabs.map((tab) => tab.id);
    const index = order.indexOf(active);
    if (index === -1) return;

    let next = null;
    if (event.key === 'ArrowRight') next = order[(index + 1) % order.length];
    if (event.key === 'ArrowLeft') next = order[(index - 1 + order.length) % order.length];
    if (event.key === 'Home') next = order[0];
    if (event.key === 'End') next = order[order.length - 1];

    if (next) {
      event.preventDefault();
      onChange(next);
      // Move focus with the selection, or the arrow keys move the highlight
      // while the screen reader stays announcing the old tab.
      refs.current[next]?.focus();
    }
  }

  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={handleKeyDown}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            ref={(node) => {
              refs.current[tab.id] = node;
            }}
            className={`tabs__tab${selected ? ' tabs__tab--active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge !== null && (
              <span className="tabs__badge">{tab.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The region a tab controls. Kept beside Tabs so the ids cannot drift apart. */
export function TabPanel({ id, active, children }) {
  if (id !== active) return null;
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0}>
      {children}
    </div>
  );
}
