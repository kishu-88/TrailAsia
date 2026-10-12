import { api } from './apiClient.js';
import { toQuery } from './users.service.js';

/**
 * Reporting.
 *
 * One call per tab rather than one per report. The server assembles a tab's
 * worth of figures in a single read, so the page does not open eight
 * connections to render one screen.
 */

/** Pipeline, revenue by destination, consultant performance, money over time. */
export function getCommercial(params = {}) {
  return api.get(`/reports/commercial${toQuery(params)}`).then((response) => response.data);
}

/** Departure readiness, partner reliability, task throughput, what is overdue. */
export function getOperational(params = {}) {
  return api.get(`/reports/operational${toQuery(params)}`).then((response) => response.data);
}

/** The four figures on the dashboard. Deliberately cheaper than a whole tab. */
export function getHeadline(params = {}) {
  return api.get(`/reports/headline${toQuery(params)}`).then((response) => response.data);
}
