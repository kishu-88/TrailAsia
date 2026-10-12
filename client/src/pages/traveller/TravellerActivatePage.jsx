import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useTravellerAuth } from '../../context/TravellerAuthContext.jsx';
import '../../styles/traveller.css';

/**
 * Setting a password from an invitation link: /trip/activate?token=…
 *
 * The token is read from the query string and never shown. Two password fields
 * rather than one, because somebody doing this on a phone keyboard, once, with
 * no way to reset it themselves, will otherwise lock themselves out with a typo.
 */
export default function TravellerActivatePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { activate } = useTravellerAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setFieldErrors({});
    setFormError('');

    if (password !== confirmation) {
      setFieldErrors({ confirmation: 'The two passwords do not match.' });
      return;
    }

    setSubmitting(true);
    try {
      await activate(token, password);
      navigate('/trip', { replace: true });
    } catch (error) {
      if (error.details) setFieldErrors(error.details);
      else setFormError(error.message || 'Could not set your password.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="traveller-app">
        <div className="traveller-frame traveller-frame--auth">
          <header className="traveller-auth__header">
            <h1 className="traveller-auth__title">This link is incomplete</h1>
          </header>
          <p className="traveller-auth__note">
            Open the link exactly as the agency sent it, or call the office for a new one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="traveller-app">
      <div className="traveller-frame traveller-frame--auth">
        <header className="traveller-auth__header">
          <h1 className="traveller-auth__title">Choose a password</h1>
          <p className="traveller-auth__subtitle">
            This is how you will sign in to see your trip.
          </p>
        </header>

        <form className="traveller-auth__form" onSubmit={handleSubmit} noValidate>
          {formError && (
            <div className="alert alert--error" role="alert">
              {formError}
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor="new-password">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              className={`field__input${fieldErrors.password ? ' field__input--invalid' : ''}`}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              autoFocus
              required
            />
            <p className="field__hint">At least 12 characters.</p>
            {fieldErrors.password && <p className="field__error">{fieldErrors.password}</p>}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="confirm-password">
              Type it again
            </label>
            <input
              id="confirm-password"
              type="password"
              className={`field__input${fieldErrors.confirmation ? ' field__input--invalid' : ''}`}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
              required
            />
            {fieldErrors.confirmation && (
              <p className="field__error">{fieldErrors.confirmation}</p>
            )}
          </div>

          <button type="submit" className="t-action t-action--primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Set password and continue'}
          </button>
        </form>

        <p className="traveller-auth__note">
          Your trip details include your passport and insurance information, so this account is
          protected the same way a staff account is.
        </p>
      </div>
    </div>
  );
}
