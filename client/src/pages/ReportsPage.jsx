import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import Button from '../components/common/Button.jsx';
import Card from '../components/common/Card.jsx';
import ErrorNotice from '../components/common/ErrorNotice.jsx';
import Spinner from '../components/common/Spinner.jsx';
import Tabs, { TabPanel } from '../components/common/Tabs.jsx';
import { SelectField, TextField } from '../components/common/Field.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import CommercialTab from '../features/reports/CommercialTab.jsx';
import OperationalTab from '../features/reports/OperationalTab.jsx';
import * as reportsService from '../services/reports.service.js';

const TABS = [
  { id: 'commercial', label: 'Commercial' },
  { id: 'operational', label: 'Operational' },
];

const HORIZONS = [
  { value: '30', label: 'Next 30 days' },
  { value: '60', label: 'Next 60 days' },
  { value: '90', label: 'Next 90 days' },
  { value: '180', label: 'Next 6 months' },
];

/** `months` back from today, as YYYY-MM-DD. */
function monthsAgo(months) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Reporting.
 *
 * Two tabs, each one read. The tab and the date range live in the URL rather
 * than in component state, so a coordinator can send someone a link to exactly
 * what they are looking at — which is how a report gets discussed rather than
 * screenshotted.
 *
 * Each tab loads when it is first opened and not before. Opening the page
 * should not run the departure board's per-booking readiness checks for
 * somebody who only wanted the conversion rate.
 */
export default function ReportsPage() {
  const [params, setParams] = useSearchParams();

  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'commercial';
  const from = params.get('from') || monthsAgo(12);
  const to = params.get('to') || today();
  const horizonDays = params.get('horizonDays') || '60';

  const [commercial, setCommercial] = useState(null);
  const [operational, setOperational] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const update = useCallback(
    (changes) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'commercial') {
        setCommercial(await reportsService.getCommercial({ from, to }));
      } else {
        setOperational(await reportsService.getOperational({ from, to, horizonDays }));
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [tab, from, to, horizonDays]);

  useEffect(() => {
    load();
  }, [load]);

  const data = tab === 'commercial' ? commercial : operational;

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Read across every module. Nothing here is stored — the figures are assembled from the live data each time."
      />

      <Tabs tabs={TABS} active={tab} onChange={(id) => update({ tab: id })} label="Report views" />

      <Card muted>
        <div className="filter-bar filter-bar--flush">
          <TextField
            label="From"
            type="date"
            value={from}
            max={to}
            onChange={(event) => update({ from: event.target.value })}
          />
          <TextField
            label="To"
            type="date"
            value={to}
            min={from}
            onChange={(event) => update({ to: event.target.value })}
          />
          {tab === 'operational' && (
            <SelectField
              label="Departures within"
              value={horizonDays}
              onChange={(event) => update({ horizonDays: event.target.value })}
              options={HORIZONS}
            />
          )}
          <div className="filter-bar__reset">
            <Button
              size="small"
              onClick={() => update({ from: null, to: null, horizonDays: null })}
            >
              Last 12 months
            </Button>
          </div>
        </div>
        <p className="muted small">
          {tab === 'commercial'
            ? 'The range filters when a booking was raised, and when money was received.'
            : 'The range filters task throughput. The departure board uses the horizon instead — it is about what is coming, not what has been.'}
        </p>
      </Card>

      {error ? (
        <ErrorNotice error={error} onRetry={load} />
      ) : loading && !data ? (
        <Spinner block label="Assembling the figures…" />
      ) : data ? (
        <div className={loading ? 'is-refreshing' : undefined}>
          <TabPanel id="commercial" active={tab}>
            {commercial && <CommercialTab data={commercial} />}
          </TabPanel>
          <TabPanel id="operational" active={tab}>
            {operational && <OperationalTab data={operational} />}
          </TabPanel>
        </div>
      ) : null}
    </>
  );
}
