/** A titled panel. `actions` sits on the right of the header. */
export default function Card({ title, subtitle, actions, muted = false, padded = true, children }) {
  return (
    <section className={`card${muted ? ' card--muted' : ''}`}>
      {(title || actions) && (
        <header className="card__header">
          <div>
            {title && <h2 className="card__title">{title}</h2>}
            {subtitle && <p className="card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'card__body' : 'card__body card__body--flush'}>{children}</div>
    </section>
  );
}
