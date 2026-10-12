'use strict';

const {
  db,
  anon,
  resetDatabase,
  signIn,
  createDestination,
  createOperator,
  signInOperator,
  OPERATOR_PASSWORD,
} = require('./helpers');
const mailerService = require('../src/services/mailer.service');

beforeEach(resetDatabase);

/** Invite an operator and hand back the one-time token. */
async function invite(actor, operator) {
  const response = await actor.as('post', `/operators/${operator.id}/portal-invite`);
  if (response.status !== 201) {
    throw new Error(`Invite failed (${response.status}): ${response.text}`);
  }
  return response.body.data.inviteToken;
}

describe('operator portal invitations', () => {
  it('issues a single-use token and marks the operator as invited', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const destination = await createDestination();
    const operator = await createOperator(destination.id);

    const response = await actor.as('post', `/operators/${operator.id}/portal-invite`);

    expect(response.status).toBe(201);
    expect(response.body.data.inviteToken).toEqual(expect.any(String));
    expect(response.body.data.operator.portal.state).toBe('invited');

    const stored = await db.Operator.scope('withCredentials').findByPk(operator.id);
    expect(stored.inviteTokenHash).toEqual(expect.any(String));
    expect(stored.inviteTokenHash).not.toBe(response.body.data.inviteToken);
  });

  it('refuses to invite an operator with no contact email', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const destination = await createDestination();
    const operator = await createOperator(destination.id, { contactEmail: null });

    const response = await actor.as('post', `/operators/${operator.id}/portal-invite`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('NO_EMAIL');
  });

  it('does not let a consultant issue an invitation — that is a directory decision', async () => {
    const actor = await signIn({ role: 'consultant' });
    const destination = await createDestination();
    const operator = await createOperator(destination.id);

    const response = await actor.as('post', `/operators/${operator.id}/portal-invite`);

    expect(response.status).toBe(403);
  });

  it('emails the activation link to the operator contact', async () => {
    const sendEmail = jest.spyOn(mailerService, 'sendEmail').mockResolvedValue({ sent: true });
    const actor = await signIn({ role: 'coordinator' });
    const destination = await createDestination();
    const operator = await createOperator(destination.id, {
      contactEmail: 'operator-invitee@example.com',
    });

    const response = await actor.as('post', `/operators/${operator.id}/portal-invite`);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [call] = sendEmail.mock.calls;
    expect(call[0].to).toBe('operator-invitee@example.com');
    expect(call[0].text).toContain(response.body.data.inviteToken);
    expect(call[0].text).toContain('/operator/activate?token=');

    sendEmail.mockRestore();
  });

  it('still issues the invite if Mailgun is unreachable', async () => {
    const sendEmail = jest
      .spyOn(mailerService, 'sendEmail')
      .mockRejectedValue(new Error('Mailgun is down'));
    const actor = await signIn({ role: 'coordinator' });
    const destination = await createDestination();
    const operator = await createOperator(destination.id);

    const response = await actor.as('post', `/operators/${operator.id}/portal-invite`);

    expect(response.status).toBe(201);
    expect(response.body.data.inviteToken).toEqual(expect.any(String));

    sendEmail.mockRestore();
  });

  it('revokes access and ends every session', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const destination = await createDestination();
    const session = await signInOperator(destination.id);

    const revoke = await actor.as('delete', `/operators/${session.operator.id}/portal-access`);
    expect(revoke.status).toBe(200);
    expect(revoke.body.data.operator.portal.enabled).toBe(false);

    const refreshed = await anon('post', '/auth/operator/refresh').set('Cookie', session.cookie);
    expect(refreshed.status).toBe(401);
  });
});

describe('operator activation', () => {
  it('sets a password and starts a session', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const destination = await createDestination();
    const operator = await createOperator(destination.id);
    const token = await invite(actor, operator);

    const response = await anon('post', '/auth/operator/activate').send({
      token,
      password: 'a-long-enough-password',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.operator.name).toBe(operator.name);
    expect(response.headers['set-cookie'].join()).toContain('trailasia_rt_operator');
  });

  it('rejects an expired invitation', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const destination = await createDestination();
    const operator = await createOperator(destination.id);
    const token = await invite(actor, operator);

    await db.Operator.update(
      { inviteExpiresAt: new Date(Date.now() - 60000) },
      { where: { id: operator.id } }
    );

    const response = await anon('post', '/auth/operator/activate').send({
      token,
      password: 'a-long-enough-password',
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVITE_EXPIRED');
  });
});

describe('operator sign-in', () => {
  it('signs an operator in and shows them their own record', async () => {
    const destination = await createDestination();
    const session = await signInOperator(destination.id);

    const response = await session.as('get', '/auth/operator/me');

    expect(response.status).toBe(200);
    expect(response.body.data.operator.id).toBe(String(session.operator.id));
  });

  it('gives the same answer for a wrong password and an unknown address', async () => {
    const destination = await createDestination();
    const session = await signInOperator(destination.id);

    const wrongPassword = await anon('post', '/auth/operator/login').send({
      email: session.operator.contactEmail,
      password: 'not-the-right-password',
    });
    const unknown = await anon('post', '/auth/operator/login').send({
      email: 'nobody@example.com',
      password: 'not-the-right-password',
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('locks the account after repeated failures', async () => {
    const destination = await createDestination();
    const session = await signInOperator(destination.id);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      await anon('post', '/auth/operator/login').send({
        email: session.operator.contactEmail,
        password: 'wrong-password-here',
      });
    }

    const response = await anon('post', '/auth/operator/login').send({
      email: session.operator.contactEmail,
      password: OPERATOR_PASSWORD,
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('rotates the refresh token and treats reuse as theft', async () => {
    const destination = await createDestination();
    const session = await signInOperator(destination.id);

    const first = await anon('post', '/auth/operator/refresh').set('Cookie', session.cookie);
    expect(first.status).toBe(200);

    const reused = await anon('post', '/auth/operator/refresh').set('Cookie', session.cookie);
    expect(reused.status).toBe(401);
    expect(reused.body.error.code).toBe('REFRESH_TOKEN_REUSED');
  });

  it('never lets an operator token authenticate a traveller or staff route', async () => {
    const destination = await createDestination();
    const session = await signInOperator(destination.id);

    const staffRoute = await anon('get', '/travellers').set(
      'Authorization',
      `Bearer ${session.accessToken}`
    );
    const travellerRoute = await anon('get', '/me/trips').set(
      'Authorization',
      `Bearer ${session.accessToken}`
    );

    expect(staffRoute.status).toBe(401);
    expect(travellerRoute.status).toBe(401);
  });
});
