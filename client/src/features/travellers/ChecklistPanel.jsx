import { useState } from 'react';

import Badge from '../../components/common/Badge.jsx';
import Button from '../../components/common/Button.jsx';
import Card from '../../components/common/Card.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { FieldGrid, TextField } from '../../components/common/Field.jsx';
import { getChecklist } from '../../services/travellers.service.js';
import { documentStatusTone, formatDate, humanise } from '../../utils/format.js';

/**
 * Check one traveller against a chosen set of destinations.
 *
 * Separate from the booking readiness view on purpose: a consultant quoting a
 * trip wants to know what someone would need *before* a booking exists, and this
 * answers that without creating one.
 */
export default function ChecklistPanel({ travellerId, destinations }) {
  const [selected, setSelected] = useState([]);
  const [departureDate, setDeparture] = useState('');
  const [returnDate, setReturn] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function toggle(id) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  }

  async function run() {
    if (selected.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getChecklist(travellerId, {
        destinationIds: selected,
        departureDate: departureDate || undefined,
        returnDate: returnDate || undefined,
      });
      setResult(response);
    } catch (caught) {
      setError(caught);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card
      title="Document checklist"
      subtitle="What this traveller would need for a given trip."
    >
      <div className="checklist-picker">
        <p className="field__label">Destinations</p>
        <div className="chip-row">
          {destinations.map((destination) => (
            <button
              key={destination.id}
              type="button"
              className={`chip${selected.includes(destination.id) ? ' chip--on' : ''}`}
              onClick={() => toggle(destination.id)}
              aria-pressed={selected.includes(destination.id)}
            >
              {destination.name}
            </button>
          ))}
        </div>

        <FieldGrid>
          <TextField
            label="Departure"
            type="date"
            value={departureDate}
            onChange={(event) => setDeparture(event.target.value)}
            hint="Enables due dates."
          />
          <TextField
            label="Return"
            type="date"
            value={returnDate}
            onChange={(event) => setReturn(event.target.value)}
            hint="Passport validity is measured from here."
          />
        </FieldGrid>

        <Button variant="primary" onClick={run} disabled={selected.length === 0} loading={loading}>
          Check documents
        </Button>
      </div>

      {loading && <Spinner block label="Checking…" />}

      {error && (
        <EmptyState title="Could not run the check" message={error.message} />
      )}

      {result && !loading && (
        <div className="checklist-result">
          <div
            className={`readiness-banner readiness-banner--${
              result.data.summary.ready ? 'ready' : 'blocked'
            }`}
          >
            <p className="readiness-banner__headline">
              {result.data.summary.ready
                ? 'All requirements met'
                : `${result.data.summary.outstanding} outstanding`}
            </p>
          </div>

          <ul className="checklist">
            {result.data.items.map((item, index) => (
              <li
                key={`${item.requirement.id}-${index}`}
                className={`checklist__item${item.satisfied ? '' : ' checklist__item--flagged'}`}
              >
                <span
                  className={`checklist__mark checklist__mark--${
                    item.satisfied ? 'ok' : item.overdue ? 'overdue' : 'pending'
                  }`}
                  aria-hidden="true"
                >
                  {item.satisfied ? '✓' : '!'}
                </span>
                <div className="checklist__body">
                  <div className="checklist__heading">
                    <span>{item.requirement.name}</span>
                    <Badge tone={documentStatusTone(item.status)}>{humanise(item.status)}</Badge>
                    {item.overdue && <Badge tone="danger">Overdue</Badge>}
                  </div>
                  <p className="muted checklist__meta">
                    {item.destination.name}
                    {item.dueBy && ` · due by ${formatDate(item.dueBy)}`}
                  </p>
                  {item.issues.length > 0 && (
                    <ul className="checklist__issues">
                      {item.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
