import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useTravellerAuth } from '../../context/TravellerAuthContext.jsx';
import '../../styles/traveller.css';

/**
 * The traveller's sign-in screen.
 *
 * Phone-shaped, like everything else a traveller sees, and separate from the
 * staff sign-in at /login. Sharing one form would mean a traveller typing their
 * details into a page headed "staff portal", and a failed sign-in would not be
 * able to say anything useful about which kind of account was meant.
 */
export default function TravellerSignInPage() {
  const { login, isAuthenticated, isLoading } = useTravellerAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const destination = location.state?.from?.pathname || '/trip';

  useEffect(() => {
    if (isAuthenticated) navigate(destination, { replace: true });
  }, [isAuthenticated, destination, navigate]);

  async function handleSubmit(event) {
    event.preventDefault();
    setFieldErrors({});
    setFormError('');
    setSubmitting(true);

    try {
      await login(email, password);
      navigate(destination, { replace: true });
    } catch (error) {
      if (error.details) setFieldErrors(error.details);
      else setFormError(error.message || 'Could not sign in. Please try again.');
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="page-centre">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="traveller-app">
      <div className="traveller-frame traveller-frame--auth">
        <header className="traveller-auth__header">
          <h1 className="traveller-auth__title">Your trip</h1>
          <p className="traveller-auth__subtitle">Himalayas Travel and Tour</p>
        </header>

        <form className="traveller-auth__form" onSubmit={handleSubmit} noValidate>
          {formError && (
            <div className="alert alert--error" role="alert">
              {formError}
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor="traveller-email">
              Email address
            </label>
            <input
              id="traveller-email"
              type="email"
              className={`field__input${fieldErrors.email ? ' field__input--invalid' : ''}`}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              // Large enough to type on a phone with cold hands.
              inputMode="email"
              autoFocus
              required
            />
            {fieldErrors.email && <p className="field__error">{fieldErrors.email}</p>}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="traveller-password">
              Password
            </label>
            <input
              id="traveller-password"
              type="password"
              className={`field__input${fieldErrors.password ? ' field__input--invalid' : ''}`}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
            {fieldErrors.password && <p className="field__error">{fieldErrors.password}</p>}
          </div>

          <button
            type="submit"
            className="t-action t-action--primary"
            disabled={submitting}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="traveller-auth__note">
          Your agency sends you a link to set a password the first time. If you have lost it,
          or the link has expired, call the office and they will send another.
        </p>
      </div>
    </div>
  );
}
