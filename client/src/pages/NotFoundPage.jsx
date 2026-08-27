import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="page-centre">
      <div className="stack stack--centre">
        <h1 className="heading">Page not found</h1>
        <p className="muted">That route does not exist.</p>
        <Link className="button button--secondary" to="/">
          Back to the dashboard
        </Link>
      </div>
    </div>
  );
}
