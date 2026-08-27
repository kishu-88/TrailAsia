import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const destination = location.state?.from?.pathname || '/';

  // Someone who is already signed in has no business on this page.
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
      if (error.details) {
        setFieldErrors(error.details);
      } else {
        setFormError(error.message || 'Could not sign in. Please try again.');
      }
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
    <div className="page-centre">
      <div className="auth-card">
        <header className="auth-card__header">
          <h1 className="auth-card__title">TrailAsia</h1>
          <p className="auth-card__subtitle">Himalayas Travel and Tour — staff portal</p>
        </header>

        <form onSubmit={handleSubmit} noValidate>
          {formError && (
            <div className="alert alert--error" role="alert">
              {formError}
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor="email">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className={`field__input${fieldErrors.email ? ' field__input--invalid' : ''}`}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
            {fieldErrors.email && <p className="field__error">{fieldErrors.email}</p>}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className={`field__input${fieldErrors.password ? ' field__input--invalid' : ''}`}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
            {fieldErrors.password && <p className="field__error">{fieldErrors.password}</p>}
          </div>

          <button type="submit" className="button button--primary" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="auth-card__note">
          Accounts are created by an administrator. Contact the agency office if you need access.
        </p>
      </div>
    </div>
  );
}
