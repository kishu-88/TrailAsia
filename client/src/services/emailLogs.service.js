import { api } from './apiClient.js';
import { toQuery } from './users.service.js';

/** Admin-only read of every email send attempt — see email_logs on the server. */
export function listEmailLogs(params = {}) {
  return api.get(`/email-logs${toQuery(params)}`);
}
