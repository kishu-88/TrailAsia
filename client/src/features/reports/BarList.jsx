/**
 * A bar chart that is really a table.
 *
 * No charting library. Partly because a 300 KB dependency to draw twelve
 * rectangles is a poor trade, but mainly because a canvas chart is invisible to
 * a screen reader and unreadable when printed in black and white. This renders
 * a real `<table>` with the numbers in it, and the bars are decorative widths
 * on top — so the figures are available to everyone, and the shape is available
 * to anyone looking at it.
 *
 * Bars are scaled against the largest value in the set, not against a total, so
 * a set of similar values still shows its differences instead of twelve bars
 * that all look full.
 *
 * @param {Array} rows  [{ label, value, display, sub, tone }]
 */
export default function BarList({ rows = [], caption, valueHeader = 'Value', emptyMessage }) {
  if (rows.length === 0) {
    return <p className="muted bar-list__empty">{emptyMessage || 'Nothing to show yet.'}</p>;
  }

  const peak = rows.reduce((highest, row) => Math.max(highest, Number(row.value) || 0), 0);

  return (
    <table className="bar-list">
      {caption && <caption className="bar-list__caption">{caption}</caption>}
      <thead>
        <tr>
          <th scope="col">Item</th>
          <th scope="col" className="bar-list__chart-header">
            {/* The bars carry no information the value column does not, so the
                header is hidden from assistive technology rather than read out
                as a meaningless column. */}
            <span aria-hidden="true">Share</span>
          </th>
          <th scope="col" className="bar-list__value-header">
            {valueHeader}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const width = peak > 0 ? Math.max((Number(row.value) || 0) / peak, 0) * 100 : 0;
          return (
            <tr key={row.key || row.label}>
              <th scope="row" className="bar-list__label">
                {row.label}
                {row.sub && <span className="muted bar-list__sub">{row.sub}</span>}
              </th>
              <td className="bar-list__chart">
                <div className="bar-list__track" aria-hidden="true">
                  <div
                    className={`bar-list__bar${row.tone ? ` bar-list__bar--${row.tone}` : ''}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </td>
              <td className="bar-list__value">{row.display ?? row.value}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Two series side by side — raised against closed, month by month.
 *
 * Same reasoning as BarList: a table underneath, bars on top. The two bars
 * share one scale so "more came in than went out" is visible as a shape rather
 * than something the reader has to work out from the numbers.
 */
export function PairedBarList({ rows = [], labels = ['A', 'B'], emptyMessage }) {
  if (rows.length === 0) {
    return <p className="muted bar-list__empty">{emptyMessage || 'Nothing to show yet.'}</p>;
  }

  const peak = rows.reduce(
    (highest, row) => Math.max(highest, Number(row.a) || 0, Number(row.b) || 0),
    0
  );

  return (
    <>
      {/* The two series were both green to begin with, and the palette's
          primary and success sit four points apart on the hue wheel — so the
          chart drew two bars nobody could tell apart. Blue for work arriving,
          green for work finished, and a legend saying so. */}
      <p className="bar-legend">
        <span className="bar-legend__item">
          <span className="bar-legend__swatch bar-legend__swatch--info" aria-hidden="true" />
          {labels[0]}
        </span>
        <span className="bar-legend__item">
          <span className="bar-legend__swatch bar-legend__swatch--success" aria-hidden="true" />
          {labels[1]}
        </span>
      </p>

      <table className="bar-list">
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col" className="bar-list__chart-header">
              <span aria-hidden="true">Shape</span>
            </th>
            <th scope="col" className="bar-list__value-header">
              {labels[0]}
            </th>
            <th scope="col" className="bar-list__value-header">
              {labels[1]}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="bar-list__label">
                {row.label}
              </th>
              <td className="bar-list__chart">
                <div className="bar-list__track" aria-hidden="true">
                  <div
                    className="bar-list__bar bar-list__bar--info"
                    style={{ width: peak > 0 ? `${((Number(row.a) || 0) / peak) * 100}%` : 0 }}
                  />
                  <div
                    className="bar-list__bar bar-list__bar--success"
                    style={{ width: peak > 0 ? `${((Number(row.b) || 0) / peak) * 100}%` : 0 }}
                  />
                </div>
              </td>
              <td className="bar-list__value">{row.a}</td>
              <td className="bar-list__value">{row.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
