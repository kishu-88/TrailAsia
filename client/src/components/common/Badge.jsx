/** Small status pill. Tones: neutral, info, success, warning, danger. */
export default function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
