'use strict';

const { db, resetDatabase, signIn } = require('./helpers');

beforeEach(resetDatabase);

describe('permissions', () => {
  it.each(['consultant', 'coordinator', 'finance'])(
    'refuses %s access to the email log',
    async (role) => {
      const actor = await signIn({ role });
      const response = await actor.as('get', '/email-logs');
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('INSUFFICIENT_ROLE');
    }
  );

  it('allows an administrator', async () => {
    const actor = await signIn({ role: 'admin' });
    expect((await actor.as('get', '/email-logs')).status).toBe(200);
  });
});

describe('listing', () => {
  it('shows every attempt, newest first', async () => {
    const admin = await signIn({ role: 'admin' });
    const base = Date.now();
    // Explicit, distinct timestamps — bulkCreate can otherwise insert all
    // three rows within the same millisecond, which makes "newest first"
    // untestable since the DB has no stable tiebreaker to assert against.
    await db.EmailLog.bulkCreate([
      {
        toAddress: 'a@example.com',
        subject: 'First',
        status: 'sent',
        createdAt: new Date(base),
      },
      {
        toAddress: 'b@example.com',
        subject: 'Second',
        status: 'failed',
        error: 'boom',
        createdAt: new Date(base + 1000),
      },
      {
        toAddress: 'c@example.com',
        subject: 'Third',
        status: 'skipped',
        error: 'not_configured',
        createdAt: new Date(base + 2000),
      },
    ]);

    const response = await admin.as('get', '/email-logs');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(3);
    expect(response.body.data.map((row) => row.subject)).toEqual(['Third', 'Second', 'First']);
    expect(response.body.data[0]).toMatchObject({
      to: 'c@example.com',
      status: 'skipped',
      error: 'not_configured',
    });
  });

  it('filters by status', async () => {
    const admin = await signIn({ role: 'admin' });
    await db.EmailLog.bulkCreate([
      { toAddress: 'a@example.com', subject: 'Sent one', status: 'sent' },
      { toAddress: 'b@example.com', subject: 'Failed one', status: 'failed', error: 'boom' },
    ]);

    const response = await admin.as('get', '/email-logs?status=failed');

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].subject).toBe('Failed one');
  });

  it('filters by context', async () => {
    const admin = await signIn({ role: 'admin' });
    await db.EmailLog.bulkCreate([
      { toAddress: 'a@example.com', subject: 'Invite', status: 'sent', context: 'portal_invite:traveller' },
      { toAddress: 'b@example.com', subject: 'Notice', status: 'sent', context: 'notification:task_assigned' },
    ]);

    const response = await admin.as('get', '/email-logs?context=portal_invite:traveller');

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].subject).toBe('Invite');
  });

  it('searches by recipient or subject', async () => {
    const admin = await signIn({ role: 'admin' });
    await db.EmailLog.bulkCreate([
      { toAddress: 'findme@example.com', subject: 'Nothing special', status: 'sent' },
      { toAddress: 'other@example.com', subject: 'A findable subject', status: 'sent' },
      { toAddress: 'nomatch@example.com', subject: 'Irrelevant', status: 'sent' },
    ]);

    const response = await admin.as('get', '/email-logs?q=findme');
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].to).toBe('findme@example.com');

    const bySubject = await admin.as('get', '/email-logs?q=findable');
    expect(bySubject.body.data).toHaveLength(1);
    expect(bySubject.body.data[0].subject).toBe('A findable subject');
  });

  it('paginates', async () => {
    const admin = await signIn({ role: 'admin' });
    await db.EmailLog.bulkCreate(
      Array.from({ length: 30 }, (_, index) => ({
        toAddress: `person${index}@example.com`,
        subject: `Message ${index}`,
        status: 'sent',
      }))
    );

    const response = await admin.as('get', '/email-logs?perPage=10&page=2');

    expect(response.body.data).toHaveLength(10);
    expect(response.body.meta).toMatchObject({ page: 2, perPage: 10, total: 30, totalPages: 3 });
  });
});
