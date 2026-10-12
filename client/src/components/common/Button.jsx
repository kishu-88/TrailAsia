import { Link } from 'react-router-dom';

/**
 * One button, four tones.
 *
 * Renders an <a> when given `to`, so a navigation that looks like a button is
 * still a real link — middle-click and "open in new tab" keep working.
 */
export default function Button({
  variant = 'secondary',
  size = 'medium',
  to,
  type = 'button',
  loading = false,
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  const classes = [
    'button',
    `button--${variant}`,
    size === 'small' ? 'button--small' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} className={classes} disabled={disabled || loading} {...rest}>
      {loading && <span className="button__spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
