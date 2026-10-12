import Spinner from './Spinner.jsx';
import EmptyState from './EmptyState.jsx';

/**
 * A table driven by a column definition.
 *
 * Columns: { key, header, render?, align?, width?, hideBelow? }
 *   render(row) returns the cell content; without it the raw value is shown.
 *   hideBelow: 'md' drops the column on narrow screens rather than letting the
 *   table scroll sideways for a field nobody scans on a laptop.
 *
 * `onRowClick` makes rows navigable. The row still needs a real link inside it
 * for keyboard and middle-click users — the click handler is a convenience on
 * top, not the only way in.
 */
export default function DataTable({
  columns,
  rows,
  loading = false,
  emptyTitle = 'Nothing here yet',
  emptyMessage,
  emptyAction,
  getRowKey = (row) => row.id,
  onRowClick,
}) {
  if (loading) {
    return (
      <div className="table-wrapper">
        <Spinner block label="Loading…" />
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <EmptyState title={emptyTitle} message={emptyMessage} action={emptyAction} />
    );
  }

  return (
    <div className="table-wrapper">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={[
                  column.align === 'right' ? 'is-right' : '',
                  column.hideBelow ? `hide-below-${column.hideBelow}` : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={column.width ? { width: column.width } : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={getRowKey(row)}
              className={onRowClick ? 'table__row--clickable' : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={[
                    column.align === 'right' ? 'is-right' : '',
                    column.hideBelow ? `hide-below-${column.hideBelow}` : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
