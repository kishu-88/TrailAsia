'use strict';

const {
  anon,
  db,
  resetDatabase,
  createUser,
  signIn,
} = require('./helpers');

beforeEach(resetDatabase);

describe('POST /auth/login', () => {
  it('signs in with valid credentials and sets an httpOnly refresh cookie', async () => {
    const { user, password } = await createUser({ email: 'kishor@trailasia.test' });

    const response = await anon('post', '/auth/login').send({ email: user.email, password });

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.user.email).toBe('kishor@trailasia.test');
    expect(response.headers['set-cookie'].join(';')).toMatch(/HttpOnly/i);
  });

  it('never returns the password hash', async () => {
    const { user, password } = await createUser();
    const response = await anon('post', '/auth/login').send({ email: user.email, password });
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|\$2a\$/);
  });

  it('treats the email as case-insensitive', async () => {
    const { user, password } = await createUser({ email: 'mixed@trailasia.test' });
    const response = await anon('post', '/auth/login').send({
      email: user.email.toUpperCase(),
      password,
    });
    expect(response.status).toBe(200);
  });

  it('gives the same answer for an unknown email as for a wrong password', async () => {
    const { user } = await createUser();

    const unknown = await anon('post', '/auth/login').send({
      email: 'nobody@trailasia.test',
      password: 'some-password-1234',
    });
    const wrong = await anon('post', '/auth/login').send({
      email: user.email,
      password: 'wrong-password-1234',
    });

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    expect(unknown.body.error.code).toBe(wrong.body.error.code);
  });

  it('reports validation errors per field', async () => {
    const response = await anon('post', '/auth/login').send({ email: 'nope', password: '' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.email).toBeTruthy();
    expect(response.body.error.details.password).toBeTruthy();
  });

  it('locks the account after the configured number of failures', async () => {
    const { user, password } = await createUser();

    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await anon('post', '/auth/login').send({ email: user.email, password: 'wrong-pass-000' });
    }

    const response = await anon('post', '/auth/login').send({ email: user.email, password });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('refuses a deactivated account', async () => {
    const { user, password } = await createUser();
    await user.update({ isActive: false });

    const response = await anon('post', '/auth/login').send({ email: user.email, password });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_INACTIVE');
  });
});

describe('POST /auth/refresh', () => {
  it('rotates the refresh token', async () => {
    const actor = await signIn();

    const response = await anon('post', '/auth/refresh').set('Cookie', actor.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.headers['set-cookie'][0]).not.toBe(actor.cookie[0]);
  });

  it('revokes every session when a rotated token is presented again', async () => {
    const actor = await signIn();
    await anon('post', '/auth/refresh').set('Cookie', actor.cookie);

    const reuse = await anon('post', '/auth/refresh').set('Cookie', actor.cookie);

    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('REFRESH_TOKEN_REUSED');
    const active = await db.RefreshToken.count({ where: { revokedAt: null } });
    expect(active).toBe(0);
  });

  it('rejects a request with no cookie', async () => {
    const response = await anon('post', '/auth/refresh');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('NO_REFRESH_TOKEN');
  });
});

describe('POST /auth/logout', () => {
  it('revokes the session', async () => {
    const actor = await signIn();

    expect((await anon('post', '/auth/logout').set('Cookie', actor.cookie)).status).toBe(204);

    const after = await anon('post', '/auth/refresh').set('Cookie', actor.cookie);
    expect(after.status).toBe(401);
  });
});

describe('GET /auth/me', () => {
  it('returns the signed-in user', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const response = await actor.as('get', '/auth/me');
    expect(response.status).toBe(200);
    expect(response.body.data.user.role).toBe('coordinator');
  });

  it('rejects a request with no token', async () => {
    const response = await anon('get', '/auth/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('NO_ACCESS_TOKEN');
  });

  it('rejects a token belonging to a deactivated account', async () => {
    const actor = await signIn();
    await actor.user.update({ isActive: false });

    const response = await actor.as('get', '/auth/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('ACCOUNT_INACTIVE');
  });
});

describe('POST /auth/change-password', () => {
  it('changes the password and revokes other sessions', async () => {
    const actor = await signIn();
    const otherSession = await anon('post', '/auth/login').send({
      email: actor.user.email,
      password: actor.password,
    });

    const response = await actor.as('post', '/auth/change-password').send({
      currentPassword: actor.password,
      newPassword: 'a-brand-new-password-9876',
    });

    expect(response.status).toBe(200);

    // The other session is dead.
    const stale = await anon('post', '/auth/refresh').set(
      'Cookie',
      otherSession.headers['set-cookie']
    );
    expect(stale.status).toBe(401);

    // And the new password works.
    const relogin = await anon('post', '/auth/login').send({
      email: actor.user.email,
      password: 'a-brand-new-password-9876',
    });
    expect(relogin.status).toBe(200);
  });

  it('requires the correct current password', async () => {
    const actor = await signIn();
    const response = await actor.as('post', '/auth/change-password').send({
      currentPassword: 'not-the-right-one',
      newPassword: 'a-brand-new-password-9876',
    });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
  });

  it('rejects a new password identical to the old one', async () => {
    const actor = await signIn();
    const response = await actor.as('post', '/auth/change-password').send({
      currentPassword: actor.password,
      newPassword: actor.password,
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('PASSWORD_UNCHANGED');
  });

  it('enforces a minimum length', async () => {
    const actor = await signIn();
    const response = await actor.as('post', '/auth/change-password').send({
      currentPassword: actor.password,
      newPassword: 'short',
    });
    expect(response.status).toBe(400);
    expect(response.body.error.details.newPassword).toBeTruthy();
  });
});
