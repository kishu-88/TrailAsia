import { Link } from 'react-router-dom';

/** Title block for a screen, with optional breadcrumb and right-aligned actions. */
export default function PageHeader({ title, subtitle, backTo, backLabel, actions, meta }) {
  return (
    <header className="page-header">
      {backTo && (
        <Link to={backTo} className="page-header__back">
          ← {backLabel || 'Back'}
        </Link>
      )}
      <div className="page-header__row">
        <div className="page-header__titles">
          <h1 className="page-header__title">{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
          {meta && <div className="page-header__meta">{meta}</div>}
        </div>
        {actions && <div className="page-header__actions">{actions}</div>}
      </div>
    </header>
  );
}
