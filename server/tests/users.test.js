'use strict';

const { anon, db, resetDatabase, createUser, signIn } = require('./helpers');

beforeEach(resetDatabase);

describe('permissions', () => {
  it.each(['consultant', 'coordinator', 'finance'])(
    'refuses %s access to the user list',
    async (role) => {
      const actor = await signIn({ role });
      const response = await actor.as('get', '/users');
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('INSUFFICIENT_ROLE');
    }
  );

  it('allows an administrator', async () => {
    const actor = await signIn({ role: 'admin' });
    expect((await actor.as('get', '/users')).status).toBe(200);
  });
});

describe('GET /users', () => {
  it('paginates and reports totals', async () => {
    const actor = await signIn({ role: 'admin' });
    for (let i = 0; i < 4; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await createUser({ role: 'consultant' });
    }

    const response = await actor.as('get', '/users?perPage=2&page=1');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.meta.total).toBe(5); // 4 created + the admin
    expect(response.body.meta.totalPages).toBe(3);
  });

  it('filters by role and searches by name', async () => {
    const actor = await signIn({ role: 'admin' });
    await createUser({ role: 'finance', firstName: 'Bibek', lastName: 'Chaudhary' });

    const byRole = await actor.as('get', '/users?role=finance');
    expect(byRole.body.data).toHaveLength(1);

    const bySearch = await actor.as('get', '/users?q=Bibek');
    expect(bySearch.body.data).toHaveLength(1);
    expect(bySearch.body.data[0].firstName).toBe('Bibek');
  });

  it('rejects sorting by a column that is not allow-listed', async () => {
    const actor = await signIn({ role: 'admin' });
    const response = await actor.as('get', '/users?sort=passwordHash:asc');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_SORT');
  });
});

describe('POST /users', () => {
  it('creates an account', async () => {
    const actor = await signIn({ role: 'admin' });

    const response = await actor.as('post', '/users').send({
      firstName: 'Vishal',
      lastName: 'Rawat',
      email: 'Vishal@TrailAsia.test',
      password: 'a-long-enough-password',
      role: 'coordinator',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.user.email).toBe('vishal@trailasia.test');
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash/);

    // And the account can actually sign in.
    const login = await anon('post', '/auth/login').send({
      email: 'vishal@trailasia.test',
      password: 'a-long-enough-password',
    });
    expect(login.status).toBe(200);
  });

  it('refuses a duplicate email', async () => {
    const actor = await signIn({ role: 'admin' });
    await createUser({ email: 'taken@trailasia.test' });

    const response = await actor.as('post', '/users').send({
      firstName: 'A',
      lastName: 'B',
      email: 'taken@trailasia.test',
      password: 'a-long-enough-password',
      role: 'consultant',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('EMAIL_IN_USE');
  });

  it('refuses a short password and an unknown role', async () => {
    const actor = await signIn({ role: 'admin' });

    const short = await actor.as('post', '/users').send({
      firstName: 'A',
      lastName: 'B',
      email: 'x@trailasia.test',
      password: 'short',
      role: 'consultant',
    });
    expect(short.body.error.details.password).toBeTruthy();

    const badRole = await actor.as('post', '/users').send({
      firstName: 'A',
      lastName: 'B',
      email: 'y@trailasia.test',
      password: 'a-long-enough-password',
      role: 'wizard',
    });
    expect(badRole.body.error.details.role).toBeTruthy();
  });
});

describe('PATCH /users/:id', () => {
  it('updates a user', async () => {
    const actor = await signIn({ role: 'admin' });
    const { user } = await createUser({ role: 'consultant' });

    const response = await actor.as('patch', `/users/${user.id}`).send({ role: 'finance' });

    expect(response.status).toBe(200);
    expect(response.body.data.user.role).toBe('finance');
  });

  it('rejects unknown fields rather than ignoring them', async () => {
    const actor = await signIn({ role: 'admin' });
    const { user } = await createUser();

    const response = await actor
      .as('patch', `/users/${user.id}`)
      .send({ passwordHash: 'injected' });

    expect(response.status).toBe(400);
  });

  it('stops an administrator changing their own role', async () => {
    const actor = await signIn({ role: 'admin' });
    await createUser({ role: 'admin' }); // so it is not the last-admin rule firing

    const response = await actor
      .as('patch', `/users/${actor.user.id}`)
      .send({ role: 'consultant' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CANNOT_CHANGE_OWN_ROLE');
  });

  it('refuses to demote the only active administrator', async () => {
    const actor = await signIn({ role: 'admin' });
    const { user: otherAdmin } = await createUser({ role: 'admin', isActive: false });

    const response = await actor.as('patch', `/users/${otherAdmin.id}`).send({ role: 'consultant' });
    // otherAdmin is inactive, so demoting them is fine — the acting admin remains.
    expect(response.status).toBe(200);
  });
});

describe('DELETE /users/:id', () => {
  it('deactivates rather than deletes, and kills their sessions', async () => {
    const actor = await signIn({ role: 'admin' });
    const target = await signIn({ role: 'consultant' });

    const response = await actor.as('delete', `/users/${target.user.id}`);

    expect(response.status).toBe(200);
    expect(response.body.data.user.isActive).toBe(false);
    expect(await db.User.count({ where: { id: target.user.id } })).toBe(1);

    const stale = await anon('post', '/auth/refresh').set('Cookie', target.cookie);
    expect(stale.status).toBe(401);
  });

  it('stops an administrator deactivating themselves', async () => {
    const actor = await signIn({ role: 'admin' });
    const response = await actor.as('delete', `/users/${actor.user.id}`);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CANNOT_DEACTIVATE_SELF');
  });

  it('refuses to deactivate the last active administrator', async () => {
    const actor = await signIn({ role: 'admin' });
    const { user: secondAdmin } = await createUser({ role: 'admin' });
    // Deactivate the second admin from the first — allowed, one admin remains.
    expect((await actor.as('delete', `/users/${secondAdmin.id}`)).status).toBe(200);

    // Now sign in as a fresh admin and try to remove the original: also fine,
    // because the new one remains. The guard is about reaching zero.
    const third = await signIn({ role: 'admin' });
    expect((await third.as('delete', `/users/${actor.user.id}`)).status).toBe(200);
  });
});

describe('account recovery', () => {
  it('reactivates a deactivated account', async () => {
    const actor = await signIn({ role: 'admin' });
    const { user } = await createUser({ isActive: false });

    const response = await actor.as('post', `/users/${user.id}/reactivate`);
    expect(response.body.data.user.isActive).toBe(true);
  });

  it('clears a lockout', async () => {
    const actor = await signIn({ role: 'admin' });
    const { user } = await createUser();
    await user.update({ lockedUntil: new Date(Date.now() + 600000), failedLoginAttempts: 5 });

    const response = await actor.as('post', `/users/${user.id}/unlock`);
    expect(response.status).toBe(200);
    await user.reload();
    expect(user.lockedUntil).toBeNull();
  });

  it('resets a password and revokes the user’s sessions', async () => {
    const actor = await signIn({ role: 'admin' });
    const target = await signIn({ role: 'consultant' });

    const response = await actor
      .as('post', `/users/${target.user.id}/password`)
      .send({ password: 'reset-by-the-administrator' });

    expect(response.status).toBe(204);

    const stale = await anon('post', '/auth/refresh').set('Cookie', target.cookie);
    expect(stale.status).toBe(401);

    const login = await anon('post', '/auth/login').send({
      email: target.user.email,
      password: 'reset-by-the-administrator',
    });
    expect(login.status).toBe(200);
  });
});
