'use strict';

const env = require('../config/env');
const { EmailLog } = require('../models');

/**
 * Outbound email, via Mailgun's HTTP API.
 *
 * One function, used from two places: `notification.service.js` (an email
 * copy of every in-app notification) and the two portal-invite flows
 * (`travellerAuth.service.js`, `operatorAuth.service.js`), which send the
 * activation link by email instead of relying on staff to copy/paste it —
 * the gap called out in every phase doc since the traveller portal shipped.
 *
 * No Mailgun SDK — this agency's whole account is two environment variables
 * and a domain, and the HTTP API is a single POST with no response body
 * worth parsing. Node 20's built-in `fetch` is enough.
 *
 * Unconfigured is a normal state, not an error: a fresh checkout with no
 * Mailgun account yet should still run, the same way the app already runs
 * with no object storage and no SMS provider. `sendEmail` logs what it would
 * have sent and returns rather than throwing, so nothing upstream has to
 * guard every call site with an `if (mailerConfigured)`.
 *
 * Failures are swallowed, same reasoning as `notification.service.js`: the
 * action that triggered the email — an SOS escalation, an invite, a
 * document being verified — has already happened and must not be rolled
 * back because Mailgun is down or the domain is unverified.
 *
 * Every attempt — sent, failed, or skipped — is also written to
 * `email_logs`, so "did that actually go out" has a real answer later
 * (`GET /email-logs`, admin-only) instead of only a line in a server
 * console nobody is tailing.
 */

async function sendEmail({ to, subject, text, html, context = null }) {
  if (!to) {
    await logAttempt({ to: '', subject, context, status: 'skipped', error: 'no_recipient' });
    return { sent: false, reason: 'no_recipient' };
  }

  if (!env.email.enabled) {
    // eslint-disable-next-line no-console
    console.log(`[mailer] Not configured — would have sent "${subject}" to ${to}`);
    await logAttempt({ to, subject, context, status: 'skipped', error: 'not_configured' });
    return { sent: false, reason: 'not_configured' };
  }

  const body = new URLSearchParams();
  body.append('from', env.email.from);
  body.append('to', to);
  body.append('subject', subject);
  body.append('text', text || subject);
  if (html) body.append('html', html);

  const auth = Buffer.from(`api:${env.email.mailgunApiKey}`).toString('base64');

  try {
    const response = await fetch(
      `https://api.mailgun.net/v3/${env.email.mailgunDomain}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Mailgun responded ${response.status}: ${detail.slice(0, 300)}`);
    }

    await logAttempt({ to, subject, context, status: 'sent' });
    return { sent: true };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Could not send email:', error.message);
    await logAttempt({ to, subject, context, status: 'failed', error: error.message });
    return { sent: false, reason: 'send_failed', error: error.message };
  }
}

/**
 * Record one attempt. Kept out of `sendEmail`'s own error handling — a
 * database problem while logging must never look like a Mailgun failure,
 * and must especially never throw back into a caller that already treats
 * `sendEmail` as something that cannot throw.
 */
async function logAttempt({ to, subject, context, status, error = null }) {
  try {
    await EmailLog.create({
      toAddress: to || '',
      subject: subject || '',
      context,
      status,
      error,
    });
  } catch (logError) {
    // eslint-disable-next-line no-console
    console.error('Could not record email log:', logError.message);
  }
}

module.exports = { sendEmail };
