'use strict';

const { db, resetDatabase } = require('./helpers');
const env = require('../src/config/env');
const mailer = require('../src/services/mailer.service');

/**
 * mailer.service.js in isolation — not through notify() or an invite flow,
 * both of which are covered elsewhere and already assert the email fires.
 * This file is about the Mailgun call itself: the request shape when
 * configured, that nothing here ever throws regardless of what Mailgun (or
 * the network) does, and that every attempt lands in `email_logs`.
 *
 * `env.email` is mutated directly rather than via `process.env` +
 * `jest.resetModules()` — the usual way to flip a module-load-time config
 * value — because `mailer.service.js` also requires `../models`, and
 * resetting the module registry would re-run `models/index.js` against
 * whatever `config/env.js` resolves to on a fresh require, outside the
 * SQLite override `tests/setup.js` applies once at the top of the suite.
 * Mutating the already-loaded `env.email` object sidesteps that entirely.
 */

const ORIGINAL_EMAIL = { ...env.email };

beforeEach(resetDatabase);

afterEach(() => {
  env.email.mailgunApiKey = ORIGINAL_EMAIL.mailgunApiKey;
  env.email.mailgunDomain = ORIGINAL_EMAIL.mailgunDomain;
  env.email.from = ORIGINAL_EMAIL.from;
});

function notConfigured() {
  env.email.mailgunApiKey = '';
  env.email.mailgunDomain = '';
}

function configured() {
  env.email.mailgunApiKey = 'test-key';
  env.email.mailgunDomain = 'mg.example.com';
  env.email.from = 'TrailAsia <no-reply@mg.example.com>';
}

test('not configured: skips sending, never touches the network, logs "skipped"', async () => {
  notConfigured();
  global.fetch = jest.fn();

  const result = await mailer.sendEmail({ to: 'a@example.com', subject: 'Hi', text: 'Hello' });

  expect(result).toEqual({ sent: false, reason: 'not_configured' });
  expect(global.fetch).not.toHaveBeenCalled();

  const logs = await db.EmailLog.findAll();
  expect(logs).toHaveLength(1);
  expect(logs[0].status).toBe('skipped');
  expect(logs[0].error).toBe('not_configured');
  expect(logs[0].toAddress).toBe('a@example.com');
});

test('no recipient: skips before even checking configuration, logs "skipped"', async () => {
  configured();
  global.fetch = jest.fn();

  const result = await mailer.sendEmail({ to: null, subject: 'Hi' });

  expect(result).toEqual({ sent: false, reason: 'no_recipient' });
  expect(global.fetch).not.toHaveBeenCalled();

  const logs = await db.EmailLog.findAll();
  expect(logs).toHaveLength(1);
  expect(logs[0].status).toBe('skipped');
  expect(logs[0].error).toBe('no_recipient');
});

test('configured: posts to the Mailgun API with basic auth and a form body', async () => {
  configured();
  global.fetch = jest.fn().mockResolvedValue({ ok: true });

  const result = await mailer.sendEmail({
    to: 'traveller@example.com',
    subject: 'Welcome',
    text: 'Hi there',
    context: 'notification:task_assigned',
  });

  expect(result).toEqual({ sent: true });
  expect(global.fetch).toHaveBeenCalledTimes(1);

  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toBe('https://api.mailgun.net/v3/mg.example.com/messages');
  expect(options.method).toBe('POST');
  expect(options.headers.Authorization).toBe(
    `Basic ${Buffer.from('api:test-key').toString('base64')}`
  );

  const body = options.body; // a URLSearchParams instance
  expect(body.get('from')).toBe('TrailAsia <no-reply@mg.example.com>');
  expect(body.get('to')).toBe('traveller@example.com');
  expect(body.get('subject')).toBe('Welcome');
  expect(body.get('text')).toBe('Hi there');

  const logs = await db.EmailLog.findAll();
  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({
    status: 'sent',
    toAddress: 'traveller@example.com',
    subject: 'Welcome',
    context: 'notification:task_assigned',
    error: null,
  });
});

test('falls back to the subject as the body when no text is given', async () => {
  configured();
  global.fetch = jest.fn().mockResolvedValue({ ok: true });

  await mailer.sendEmail({ to: 'traveller@example.com', subject: 'Just a subject' });

  const [, options] = global.fetch.mock.calls[0];
  expect(options.body.get('text')).toBe('Just a subject');
});

test('a Mailgun error response is reported and logged, not thrown', async () => {
  configured();
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 401,
    text: async () => 'Forbidden',
  });

  const result = await mailer.sendEmail({ to: 'traveller@example.com', subject: 'Welcome' });

  expect(result.sent).toBe(false);
  expect(result.reason).toBe('send_failed');

  const logs = await db.EmailLog.findAll();
  expect(logs[0].status).toBe('failed');
  expect(logs[0].error).toContain('401');
});

test('a network failure is reported and logged, not thrown', async () => {
  configured();
  global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

  await expect(
    mailer.sendEmail({ to: 'traveller@example.com', subject: 'Welcome' })
  ).resolves.toMatchObject({ sent: false, reason: 'send_failed' });

  const logs = await db.EmailLog.findAll();
  expect(logs[0].status).toBe('failed');
  expect(logs[0].error).toBe('ECONNREFUSED');
});
