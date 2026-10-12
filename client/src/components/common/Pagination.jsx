import Button from './Button.jsx';

/** Page controls. Renders nothing when everything fits on one page. */
export default function Pagination({ meta, page, onPageChange }) {
  if (!meta || meta.totalPages <= 1) return null;

  const from = (page - 1) * meta.perPage + 1;
  const to = Math.min(page * meta.perPage, meta.total);

  return (
    <nav className="pagination" aria-label="Pagination">
      <p className="pagination__summary">
        Showing <strong>{from}</strong>–<strong>{to}</strong> of{' '}
        <strong>{meta.total}</strong>
      </p>
      <div className="pagination__controls">
        <Button size="small" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <span className="pagination__page">
          Page {page} of {meta.totalPages}
        </span>
        <Button
          size="small"
          disabled={page >= meta.totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
