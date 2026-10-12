import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useOperatorAuth } from '../../context/OperatorAuthContext.jsx';

/**
 * Setting a password from an invitation link: /operator/activate?token=…
 *
 * Mirrors TravellerActivatePage — two password fields for the same reason:
 * one typo on a form with no self-service reset otherwise locks the operator
 * out until someone reissues the invite.
 */
export default function OperatorActivatePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { activate } = useOperatorAuth();
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
      navigate('/operator', { replace: true });
    } catch (error) {
      if (error.details) setFieldErrors(error.details);
      else setFormError(error.message || 'Could not set your password.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="page-centre">
        <div className="auth-card">
          <header className="auth-card__header">
            <h1 className="auth-card__title">This link is incomplete</h1>
          </header>
          <p className="auth-card__note">
            Open the link exactly as it was sent, or ask your TrailAsia contact for a new one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-centre">
      <div className="auth-card">
        <header className="auth-card__header">
          <h1 className="auth-card__title">Choose a password</h1>
          <p className="auth-card__subtitle">This is how you will sign in to the operator portal.</p>
        </header>

        <form onSubmit={handleSubmit} noValidate>
          {formError && (
            <div className="alert alert--error" role="alert">
              {formError}
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor="operator-new-password">
              New password
            </label>
            <input
              id="operator-new-password"
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
            <label className="field__label" htmlFor="operator-confirm-password">
              Type it again
            </label>
            <input
              id="operator-confirm-password"
              type="password"
              className={`field__input${fieldErrors.confirmation ? ' field__input--invalid' : ''}`}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
              required
            />
            {fieldErrors.confirmation && <p className="field__error">{fieldErrors.confirmation}</p>}
          </div>

          <button type="submit" className="button button--primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Set password and continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
