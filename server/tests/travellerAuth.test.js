'use strict';

const {
  db,
  anon,
  resetDatabase,
  signIn,
  signInTraveller,
  createTraveller,
  createBooking,
  TRAVELLER_PASSWORD,
} = require('./helpers');
const mailerService = require('../src/services/mailer.service');
const env = require('../src/config/env');

beforeEach(resetDatabase);

/** Invite a traveller and hand back the one-time token. */
async function invite(actor, traveller) {
  const response = await actor.as('post', `/travellers/${traveller.id}/portal-invite`);
  if (response.status !== 201) {
    throw new Error(`Invite failed (${response.status}): ${response.text}`);
  }
  return response.body.data.inviteToken;
}

describe('portal invitations', () => {
  it('issues a single-use token and marks the traveller as invited', async () => {
    const actor = await signIn({ role: 'consultant' });
    const traveller = await createTraveller();

    const response = await actor.as('post', `/travellers/${traveller.id}/portal-invite`);

    expect(response.status).toBe(201);
    expect(response.body.data.inviteToken).toEqual(expect.any(String));
    expect(response.body.data.traveller.portal.state).toBe('invited');

    // Only the hash is kept. A database dump must not contain a working link.
    const stored = await db.Traveller.scope('withCredentials').findByPk(traveller.id);
    expect(stored.inviteTokenHash).toEqual(expect.any(String));
    expect(stored.inviteTokenHash).not.toBe(response.body.data.inviteToken);
  });

  it('refuses to invite a traveller with no email address', async () => {
    const actor = await signIn({ role: 'consultant' });
    const traveller = await createTraveller({ email: null });

    const response = await actor.as('post', `/travellers/${traveller.id}/portal-invite`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('NO_EMAIL');
  });

  it('refuses to re-invite a traveller who already has access', async () => {
    const actor = await signIn({ role: 'consultant' });
    const session = await signInTraveller();

    const response = await actor.as('post', `/travellers/${session.traveller.id}/portal-invite`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('PORTAL_ALREADY_ACTIVE');
  });

  it('does not let finance issue invitations', async () => {
    const actor = await signIn({ role: 'finance' });
    const traveller = await createTraveller();

    const response = await actor.as('post', `/travellers/${traveller.id}/portal-invite`);

    expect(response.status).toBe(403);
  });

  it('emails the activation link to the traveller', async () => {
    const sendEmail = jest.spyOn(mailerService, 'sendEmail').mockResolvedValue({ sent: true });
    const actor = await signIn({ role: 'consultant' });
    const traveller = await createTraveller({ email: 'invitee@example.com' });

    const response = await actor.as('post', `/travellers/${traveller.id}/portal-invite`);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [call] = sendEmail.mock.calls;
    expect(call[0].to).toBe('invitee@example.com');
    // The link staff see in the UI and the link mailed out must be the same
    // one-time token — this just guards that nothing re-generates a second,
    // different token between the response and the email.
    expect(call[0].text).toContain(response.body.data.inviteToken);
    expect(call[0].text).toContain('/trip/activate?token=');

    sendEmail.mockRestore();
  });

  describe('where the link points', () => {
    const original = env.travellerPortalUrl;
    afterEach(() => {
      env.travellerPortalUrl = original;
    });

    it('is the staff client by default, and says the link was not emailed', async () => {
      env.travellerPortalUrl = '';
      const actor = await signIn({ role: 'consultant' });
      const traveller = await createTraveller();

      const response = await actor.as('post', `/travellers/${traveller.id}/portal-invite`);
      const { inviteToken, activationUrl, emailed, delivery } = response.body.data;

      expect(activationUrl).toBe(`${env.clientOrigin}/trip/activate?token=${inviteToken}`);
      // No mail provider is configured under test, so nothing went out and the
      // response must not tell staff that it did.
      expect(emailed).toBe(false);
      expect(delivery).toMatch(/not emailed/);
    });

    it('is TrailAsia Book when that is configured as the traveller portal', async () => {
      // A trailing slash is the obvious way to mistype this setting.
      env.travellerPortalUrl = 'https://book.trailasia.example/';
      const sendEmail = jest.spyOn(mailerService, 'sendEmail').mockResolvedValue({ sent: true });
      const actor = await signIn({ role: 'consultant' });
      const traveller = await createTraveller();

      const response = await actor.as('post', `/travellers/${traveller.id}/portal-invite`);
      const { inviteToken, activationUrl, emailed, delivery } = response.body.data;

      expect(activationUrl).toBe(`https://book.trailasia.example/activate?token=${inviteToken}`);
      // One link, not two: what staff see in the dialog is what was mailed.
      expect(sendEmail.mock.calls[0][0].text).toContain(activationUrl);
      expect(emailed).toBe(true);
      expect(delivery).toMatch(/has been emailed/);

      sendEmail.mockRestore();
    });
  });

  it('still issues the invite if Mailgun is unreachable', async () => {
    const sendEmail = jest
      .spyOn(mailerService, 'sendEmail')
      .mockRejectedValue(new Error('Mailgun is down'));
    const actor = await signIn({ role: 'consultant' });
    const traveller = await createTraveller();

    const response = await actor.as('post', `/travellers/${traveller.id}/portal-invite`);

    // mailerService.sendEmail never actually throws in production — it
    // swallows its own errors — but this proves the invite flow does not
    // depend on that: even a broken mock that rejects must not break
    // issuing the real, usable token.
    expect(response.status).toBe(201);
    expect(response.body.data.inviteToken).toEqual(expect.any(String));

    sendEmail.mockRestore();
  });
});

describe('activation', () => {
  it('sets a password and starts a session', async () => {
    const actor = await signIn({ role: 'consultant' });
    const traveller = await createTraveller();
    const token = await invite(actor, traveller);

    const response = await anon('post', '/auth/traveller/activate').send({
      token,
      password: 'a-long-enough-password',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.traveller.fullName).toBe(traveller.fullName());
    expect(response.headers['set-cookie'].join()).toContain('trailasia_rt_traveller');
  });

  it('burns the invitation so the same link cannot be used twice', async () => {
    const actor = await signIn({ role: 'consultant' });
    const traveller = await createTraveller();
    const token = await invite(actor, traveller);

    await anon('post', '/auth/traveller/activate').send({
      token,
      password: 'a-long-enough-password',
    });

    const second = await anon('post', '/auth/traveller/activate').send({
      token,
      password: 'another-long-password',
    });

    expect(second.status).toBe(401);
    expect(second.body.error.code).toBe('INVALID_INVITE');
  });

  it('rejects an expired invitation', async () => {
    const actor = await signIn({ role: 'consultant' });
    const traveller = await createTraveller();
    const token = await invite(actor, traveller);

    await db.Traveller.update(
      { inviteExpiresAt: new Date(Date.now() - 60000) },
      { where: { id: traveller.id } }
    );

    const response = await anon('post', '/auth/traveller/activate').send({
      token,
      password: 'a-long-enough-password',
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVITE_EXPIRED');
  });

  it('holds travellers to the same password length as staff', async () => {
    const actor = await signIn({ role: 'consultant' });
    const traveller = await createTraveller();
    const token = await invite(actor, traveller);

    const response = await anon('post', '/auth/traveller/activate').send({
      token,
      password: 'short',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details.password).toBeTruthy();
  });
});

describe('sign-in', () => {
  it('signs a traveller in and shows them their own unmasked passport number', async () => {
    const session = await signInTraveller({ passportNumber: 'PA7654321' });

    const response = await session.as('get', '/auth/traveller/me');

    expect(response.status).toBe(200);
    expect(response.body.data.traveller.passportNumber).toBe('PA7654321');
    expect(response.body.data.traveller.passportMasked).toBe(false);
  });

  it('gives the same answer for a wrong password and an unknown address', async () => {
    const session = await signInTraveller();

    const wrongPassword = await anon('post', '/auth/traveller/login').send({
      email: session.traveller.email,
      password: 'not-the-right-password',
    });
    const unknown = await anon('post', '/auth/traveller/login').send({
      email: 'nobody@example.com',
      password: 'not-the-right-password',
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('locks the account after repeated failures', async () => {
    const session = await signInTraveller();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      await anon('post', '/auth/traveller/login').send({
        email: session.traveller.email,
        password: 'wrong-password-here',
      });
    }

    const response = await anon('post', '/auth/traveller/login').send({
      email: session.traveller.email,
      password: TRAVELLER_PASSWORD,
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('rotates the refresh token and treats reuse as theft', async () => {
    const session = await signInTraveller();

    const first = await anon('post', '/auth/traveller/refresh').set('Cookie', session.cookie);
    expect(first.status).toBe(200);

    // The original cookie has now been rotated away. Presenting it again is the
    // signature of a stolen token, so every session for this traveller ends.
    const reused = await anon('post', '/auth/traveller/refresh').set('Cookie', session.cookie);
    expect(reused.status).toBe(401);
    expect(reused.body.error.code).toBe('REFRESH_TOKEN_REUSED');

    const afterRevocation = await anon('post', '/auth/traveller/refresh').set(
      'Cookie',
      first.headers['set-cookie']
    );
    expect(afterRevocation.status).toBe(401);
  });
});

describe('scope isolation', () => {
  it('refuses a traveller token on a staff route', async () => {
    const session = await signInTraveller();

    const response = await session.as('get', '/travellers');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('refuses a staff token on a traveller route', async () => {
    const actor = await signIn({ role: 'admin' });

    const response = await actor.as('get', '/me/trips');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_ACCESS_TOKEN');
  });

  /**
   * The failure this guards against is specific: traveller 1 and user 1 both
   * exist, so a token whose subject is a traveller id would, without the scope
   * claim, load the staff account with the same number.
   */
  it('does not let a traveller be mistaken for the staff account with the same id', async () => {
    const SHARED_ID = 4242;

    await db.User.create({
      id: SHARED_ID,
      firstName: 'Real',
      lastName: 'Administrator',
      email: 'collision-admin@trailasia.test',
      role: 'admin',
      passwordHash: await db.User.hashPassword('admin-password-1234'),
    });

    const traveller = await createTraveller({
      id: SHARED_ID,
      email: 'collision-traveller@example.com',
      passwordHash: await db.Traveller.hashPassword('traveller-password-1234'),
      portalEnabled: true,
      portalActivatedAt: new Date(),
    });

    const login = await anon('post', '/auth/traveller/login').send({
      email: traveller.email,
      password: 'traveller-password-1234',
    });
    expect(login.status).toBe(200);

    const asTraveller = (method, path) =>
      anon(method, path).set('Authorization', `Bearer ${login.body.data.accessToken}`);

    // Same subject id as the administrator, and still refused — the scope claim
    // is what stops `sub` being resolved against the wrong table.
    expect((await asTraveller('get', '/users')).status).toBe(401);
    expect((await asTraveller('get', '/travellers')).status).toBe(401);
  });

  it('shows a traveller only the trips they are on', async () => {
    const session = await signInTraveller();
    const otherTraveller = await createTraveller();

    const mine = await createBooking({ travellers: [session.traveller], title: 'Mine' });
    const theirs = await createBooking({ travellers: [otherTraveller], title: 'Theirs' });

    const response = await session.as('get', '/me/trips');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(String(mine.id));

    const forbidden = await session.as('get', `/me/trips/${theirs.id}`);
    // "Not found", not "forbidden": confirming the trip exists but belongs to
    // somebody else is itself a disclosure.
    expect(forbidden.status).toBe(404);
  });

  it('keeps the price and internal notes out of the traveller view', async () => {
    const session = await signInTraveller();
    const booking = await createBooking({ travellers: [session.traveller] });
    await booking.update({ totalAmount: '8450.00', notes: 'Client haggled hard' });

    const response = await session.as('get', `/me/trips/${booking.id}`);

    expect(response.status).toBe(200);
    expect(response.body.data.trip.totalAmount).toBeUndefined();
    expect(response.body.data.trip.notes).toBeUndefined();
  });
});

describe('revoking access', () => {
  it('ends live sessions immediately rather than at token expiry', async () => {
    const actor = await signIn({ role: 'coordinator' });
    const session = await signInTraveller();
    await createBooking({ travellers: [session.traveller] });

    expect((await session.as('get', '/me/trips')).status).toBe(200);

    const revoked = await actor.as('delete', `/travellers/${session.traveller.id}/portal-access`);
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.traveller.portal.state).toBe('not_invited');

    // The access token is still cryptographically valid — it is the record
    // lookup on every request that stops it working.
    const after = await session.as('get', '/me/trips');
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('PORTAL_ACCESS_REVOKED');
  });
});
