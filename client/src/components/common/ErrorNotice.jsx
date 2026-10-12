import Button from './Button.jsx';

/**
 * Renders a failed request.
 *
 * Shows the message the API sent rather than a generic "something went wrong",
 * because the API's messages are written for people — "Cannot move a booking
 * from confirmed to enquiry" tells the user what to do next; "Error" does not.
 */
export default function ErrorNotice({ error, onRetry, title = 'That did not work' }) {
  if (!error) return null;

  const isPermission = error.status === 403;
  const isMissing = error.status === 404;

  return (
    <div className="alert alert--error" role="alert">
      <p className="alert__title">
        {isPermission ? 'Not available to your role' : isMissing ? 'Not found' : title}
      </p>
      <p className="alert__message">{error.message || 'Please try again.'}</p>

      {error.details && (
        <ul className="alert__details">
          {Object.entries(error.details).map(([field, message]) => (
            <li key={field}>
              <strong>{field}:</strong> {String(message)}
            </li>
          ))}
        </ul>
      )}

      {onRetry && !isPermission && (
        <div className="alert__actions">
          <Button size="small" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
