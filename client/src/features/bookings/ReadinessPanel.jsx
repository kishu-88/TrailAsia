import { Link } from 'react-router-dom';

import Badge from '../../components/common/Badge.jsx';
import Button from '../../components/common/Button.jsx';
import Card from '../../components/common/Card.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import { documentStatusTone, formatDate, humanise } from '../../utils/format.js';

/**
 * Document readiness for the whole party.
 *
 * This is the fourteen-days-out question: is everyone actually cleared to travel?
 * The distinction the panel exists to make visible is between *held* and
 * *sufficient* — a traveller can hold a real, verified, unexpired insurance
 * policy and still be flagged, because the policy stops below the pass the group
 * is walking over. Those reasons come back from the API as `issues`.
 */
export default function ReadinessPanel({ readiness, loading, error, onRefresh }) {
  if (loading) {
    return (
      <Card title="Document readiness">
        <Spinner block label="Checking documents…" />
      </Card>
    );
  }

  // NO_ITINERARY is an expected state, not a failure — say what to do about it.
  if (error?.code === 'NO_ITINERARY') {
    return (
      <Card title="Document readiness">
        <EmptyState
          title="Add an itinerary first"
          message="Document requirements come from the destinations a trip visits, so there is nothing to check yet."
        />
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Document readiness">
        <EmptyState
          title="Could not check readiness"
          message={error.message}
          action={<Button onClick={onRefresh}>Try again</Button>}
        />
      </Card>
    );
  }

  if (!readiness) return null;

  const { summary, travellers } = readiness;

  return (
    <Card
      title="Document readiness"
      subtitle={
        summary.maxAltitudeMetres
          ? `Checked to ${summary.maxAltitudeMetres.toLocaleString()} m`
          : undefined
      }
      actions={
        <Button size="small" onClick={onRefresh}>
          Refresh
        </Button>
      }
    >
      <div className={`readiness-banner readiness-banner--${summary.ready ? 'ready' : 'blocked'}`}>
        <div>
          <p className="readiness-banner__headline">
            {summary.ready
              ? 'Everyone is cleared to travel'
              : `${summary.outstanding} item${summary.outstanding === 1 ? '' : 's'} outstanding`}
          </p>
          <p className="muted">
            {summary.travellersReady} of {summary.partySize} traveller
            {summary.partySize === 1 ? '' : 's'} ready
            {summary.overdue > 0 && ` · ${summary.overdue} past its due date`}
          </p>
        </div>
      </div>

      {travellers.length === 0 && (
        <EmptyState
          title="No travellers on this booking"
          message="Add the party before checking readiness."
        />
      )}

      {travellers.map((entry) => (
        <div key={entry.traveller.id} className="readiness-traveller">
          <div className="readiness-traveller__header">
            <Link to={`/travellers/${entry.traveller.id}`} className="link">
              <strong>{entry.traveller.fullName}</strong>
            </Link>
            <Badge tone={entry.summary.ready ? 'success' : 'warning'}>
              {entry.summary.ready
                ? 'Ready'
                : `${entry.summary.outstanding} outstanding`}
            </Badge>
          </div>

          <ul className="checklist">
            {entry.items.map((item, index) => (
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
                    <Badge tone={documentStatusTone(item.status)}>
                      {humanise(item.status)}
                    </Badge>
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
      ))}
    </Card>
  );
}
