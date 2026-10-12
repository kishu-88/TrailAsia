'use strict';

const {
  db,
  resetDatabase,
  signIn,
  createDestination,
  createOperator,
  signInOperator,
  createBooking,
  daysFromNow,
} = require('./helpers');

beforeEach(resetDatabase);

/** A confirmation raised against a signed-in operator, already requested. */
async function setup() {
  const destination = await createDestination();
  const staff = await signIn({ role: 'consultant' });
  const booking = await createBooking({
    consultantId: staff.user.id,
    departureDate: daysFromNow(40),
  });
  const session = await signInOperator(destination.id);

  const created = await staff.as('post', '/operators/confirmations').send({
    bookingId: String(booking.id),
    operatorId: String(session.operator.id),
    summary: 'Guides and porters, Lukla to base camp',
  });
  await staff.as('post', `/operators/confirmations/${created.body.data.confirmation.id}/request`);

  return { staff, booking, session, confirmationId: created.body.data.confirmation.id };
}

describe('GET /operator/confirmations', () => {
  it("lists only this operator's own confirmations", async () => {
    const { session } = await setup();
    const otherDestination = await createDestination({ code: 'OTHER', name: 'Somewhere Else' });
    const other = await signInOperator(otherDestination.id);

    const mine = await session.as('get', '/operator/confirmations');
    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(1);

    const theirs = await other.as('get', '/operator/confirmations');
    expect(theirs.body.data).toHaveLength(0);
  });

  it('404s on a confirmation that belongs to another operator', async () => {
    const { confirmationId } = await setup();
    const destination = await createDestination({ code: 'OTHER2', name: 'Elsewhere' });
    const other = await signInOperator(destination.id);

    const response = await other.as('get', `/operator/confirmations/${confirmationId}`);
    expect(response.status).toBe(404);
  });
});

describe('POST /operator/confirmations/:id/respond', () => {
  it('lets the operator confirm their own request', async () => {
    const { session, confirmationId } = await setup();

    const response = await session
      .as('post', `/operator/confirmations/${confirmationId}/respond`)
      .send({ confirmed: true, operatorReference: 'HA-100' });

    expect(response.status).toBe(200);
    expect(response.body.data.confirmation.status).toBe('confirmed');
    expect(response.body.data.confirmation.operatorReference).toBe('HA-100');

    // Recorded with no staff actor — this was the operator's own doing.
    const events = await db.OperatorConfirmation.findByPk(confirmationId);
    expect(events.updatedByUserId).toBeNull();
  });

  it('requires a reason to decline, same as the staff-side endpoint', async () => {
    const { session, confirmationId } = await setup();

    const response = await session
      .as('post', `/operator/confirmations/${confirmationId}/respond`)
      .send({ confirmed: false });

    expect(response.status).toBe(400);
    expect(response.body.error.details.reason).toBeTruthy();
  });

  it("refuses to let an operator answer someone else's confirmation", async () => {
    const { confirmationId } = await setup();
    const destination = await createDestination({ code: 'OTHER3', name: 'Nowhere' });
    const other = await signInOperator(destination.id);

    const response = await other
      .as('post', `/operator/confirmations/${confirmationId}/respond`)
      .send({ confirmed: true });

    expect(response.status).toBe(404);
  });

  it('notifies the trip editors when the operator declines', async () => {
    const { staff, session, confirmationId } = await setup();

    await session
      .as('post', `/operator/confirmations/${confirmationId}/respond`)
      .send({ confirmed: false, reason: 'Fully booked that week.' });

    const notification = await db.Notification.findOne({
      where: { userId: staff.user.id, type: 'operator_declined' },
    });
    expect(notification).toBeTruthy();
  });
});

describe('operator notifications', () => {
  it('sees its own notification when a confirmation request is sent', async () => {
    const { session } = await setup();

    const response = await session.as('get', '/operator/notifications');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].type).toBe('operator_confirmation_requested');

    const unread = await session.as('get', '/operator/notifications/unread-count');
    expect(unread.body.data.unread).toBe(1);
  });
});
