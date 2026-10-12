/** Loading indicator. `label` is announced to screen readers. */
export default function Spinner({ label = 'Loading…', block = false }) {
  const spinner = <span className="spinner" role="status" aria-label={label} />;
  if (!block) return spinner;
  return (
    <div className="spinner-block">
      {spinner}
      <p className="muted">{label}</p>
    </div>
  );
}
