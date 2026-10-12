'use strict';

const {
  db,
  resetDatabase,
  signIn,
  createUser,
  createBooking,
  createDestination,
  daysFromNow,
} = require('./helpers');

const money = require('../src/utils/money');

/**
 * Payments and reconciliation.
 *
 * The cases below are grouped by the thing that would go wrong if the rule were
 * missing, rather than by endpoint — a wrong balance, a payment recorded twice,
 * a consultant marking their own sale as paid.
 */

let finance;
let consultant;
let coordinator;
let booking;

async function priced(total = '8450.00', overrides = {}) {
  const created = await createBooking({
    consultantId: consultant.user.id,
    coordinatorId: coordinator.user.id,
    departureDate: daysFromNow(90),
    returnDate: daysFromNow(110),
    ...overrides,
  });
  await created.update({ totalAmount: total, currencyCode: overrides.currencyCode || 'AUD' });
  return created;
}

beforeEach(async () => {
  await resetDatabase();
  finance = await signIn({ role: 'finance' });
  consultant = await signIn({ role: 'consultant' });
  coordinator = await signIn({ role: 'coordinator' });
  booking = await priced();
});

// --- Exact arithmetic ------------------------------------------------------

describe('decimal arithmetic', () => {
  it('adds without floating-point drift', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in JavaScript. Not here.
    expect(money.addDecimal('0.10', '0.20')).toBe('0.30');
    expect(money.sumDecimals(Array(1000).fill('0.01'))).toBe('10.00');
  });

  it('converts at a rate without losing cents', () => {
    // NPR 145,000 at the rate the payment was recorded with.
    expect(money.multiplyDecimal('145000.00', '0.01187500')).toBe('1721.88');
  });

  it('rounds half away from zero, like a bank', () => {
    expect(money.multiplyDecimal('0.01', '1.50000000')).toBe('0.02');
    expect(money.multiplyDecimal('-0.01', '1.50000000')).toBe('-0.02');
  });

  it('never reports a negative amount outstanding', () => {
    expect(money.clampAtZero('-5.00')).toBe('0.00');
  });
});

// --- The plan --------------------------------------------------------------

describe('payment schedules', () => {
  it('numbers instalments in the order they are added', async () => {
    const first = await consultant
      .as('post', '/payments/schedules')
      .send({ bookingId: String(booking.id), label: 'Deposit', dueOn: daysFromNow(7), amount: '1000.00' });
    const second = await consultant
      .as('post', '/payments/schedules')
      .send({ bookingId: String(booking.id), label: 'Balance', dueOn: daysFromNow(60), amount: '7450.00' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.data.schedule.sequence).toBe(1);
    expect(second.body.data.schedule.sequence).toBe(2);
  });

  it('inherits the booking currency when none is given', async () => {
    const response = await consultant
      .as('post', '/payments/schedules')
      .send({ bookingId: String(booking.id), label: 'Deposit', dueOn: daysFromNow(7), amount: '1000.00' });

    expect(response.body.data.schedule.currencyCode).toBe('AUD');
  });

  it('refuses a plan on a cancelled booking', async () => {
    await booking.update({ status: 'cancelled', cancellationReason: 'Traveller withdrew.' });

    const response = await consultant
      .as('post', '/payments/schedules')
      .send({ bookingId: String(booking.id), label: 'Deposit', dueOn: daysFromNow(7), amount: '1000.00' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BOOKING_CANCELLED');
  });

  it('will not cut an instalment below what has already been received', async () => {
    const schedule = await addSchedule('Deposit', daysFromNow(7), '2000.00');
    await recordCleared({ paymentScheduleId: schedule.id, amount: '1500.00' });

    const response = await consultant
      .as('patch', `/payments/schedules/${schedule.id}`)
      .send({ amount: '1000.00' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('SCHEDULE_BELOW_PAID');
  });

  it('requires a reason before writing money off', async () => {
    const schedule = await addSchedule('Deposit', daysFromNow(7), '2000.00');

    const response = await finance
      .as('post', `/payments/schedules/${schedule.id}/close`)
      .send({ status: 'waived' });

    expect(response.status).toBe(400);
    expect(response.body.error.details.reason).toBeDefined();
  });

  it('records who wrote it off, and why', async () => {
    const schedule = await addSchedule('Late fee', daysFromNow(7), '150.00');

    const response = await finance
      .as('post', `/payments/schedules/${schedule.id}/close`)
      .send({ status: 'waived', reason: 'Goodwill after the Lukla flight cancellation.' });

    expect(response.status).toBe(200);
    expect(response.body.data.schedule.status).toBe('waived');
    expect(response.body.data.schedule.waivedReason).toMatch(/Lukla/);
  });

  it('refuses to cancel an instalment that money has arrived against', async () => {
    const schedule = await addSchedule('Deposit', daysFromNow(7), '2000.00');
    await recordCleared({ paymentScheduleId: schedule.id, amount: '2000.00' });

    const response = await finance
      .as('post', `/payments/schedules/${schedule.id}/close`)
      .send({ status: 'cancelled' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('SCHEDULE_HAS_PAYMENTS');
  });
});

// --- Duty separation -------------------------------------------------------

describe('who may touch the ledger', () => {
  it('lets a consultant set the plan', async () => {
    const response = await consultant
      .as('post', '/payments/schedules')
      .send({ bookingId: String(booking.id), label: 'Deposit', dueOn: daysFromNow(7), amount: '1000.00' });

    expect(response.status).toBe(201);
  });

  it('refuses to let the consultant who sold the trip record its payment', async () => {
    const response = await consultant
      .as('post', '/payments')
      .send({ bookingId: String(booking.id), amount: '1000.00', status: 'cleared' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('refuses a coordinator too — seniority is not the point, separation is', async () => {
    const response = await coordinator
      .as('post', '/payments')
      .send({ bookingId: String(booking.id), amount: '1000.00' });

    expect(response.status).toBe(403);
  });

  it('still lets the consultant read every figure', async () => {
    await recordCleared({ amount: '1000.00' });

    const response = await consultant.as('get', `/payments/bookings/${booking.id}/summary`);

    expect(response.status).toBe(200);
    expect(response.body.data.totals.received).toBe('1000.00');
  });

  it('gives finance no way to delete a ledger entry', async () => {
    const payment = await recordCleared({ amount: '1000.00' });
    const response = await finance.as('delete', `/payments/${payment.id}`);

    expect(response.status).toBe(404);
  });
});

// --- Recording money -------------------------------------------------------

describe('recording a payment', () => {
  it('defaults to pending, because money is not in the bank until it clears', async () => {
    const response = await finance
      .as('post', '/payments')
      .send({ bookingId: String(booking.id), amount: '1000.00' });

    expect(response.status).toBe(201);
    expect(response.body.data.payment.status).toBe('pending');
    expect(response.body.data.payment.counts).toBe(false);
  });

  it('keeps pending money out of the balance', async () => {
    await finance
      .as('post', '/payments')
      .send({ bookingId: String(booking.id), amount: '1000.00' });

    const response = await finance.as('get', `/payments/bookings/${booking.id}/summary`);

    expect(response.body.data.totals.received).toBe('0.00');
    expect(response.body.data.totals.awaitingClearance).toBe('1000.00');
    expect(response.body.data.totals.balance).toBe('8450.00');
  });

  it('stores the rate it used and the figure that rate produced', async () => {
    const response = await finance.as('post', '/payments').send({
      bookingId: String(booking.id),
      amount: '145000.00',
      currencyCode: 'NPR',
      exchangeRate: '0.01187500',
      status: 'cleared',
    });

    expect(response.status).toBe(201);
    const payment = response.body.data.payment;
    expect(payment.currencyCode).toBe('NPR');
    expect(payment.baseCurrencyCode).toBe('AUD');
    expect(payment.exchangeRate).toBe('0.01187500');
    expect(payment.amountInBase).toBe('1721.88');
    expect(payment.isConverted).toBe(true);
  });

  it('will not convert without being told the rate', async () => {
    const response = await finance
      .as('post', '/payments')
      .send({ bookingId: String(booking.id), amount: '145000.00', currencyCode: 'NPR' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('EXCHANGE_RATE_REQUIRED');
  });

  it('rejects a rate on a same-currency payment rather than ignoring it', async () => {
    const response = await finance.as('post', '/payments').send({
      bookingId: String(booking.id),
      amount: '1000.00',
      currencyCode: 'AUD',
      exchangeRate: '0.95',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('UNEXPECTED_EXCHANGE_RATE');
  });

  it('catches the same bank reference being keyed twice', async () => {
    await recordCleared({ amount: '1000.00', reference: 'BT-99417' });

    const response = await finance.as('post', '/payments').send({
      bookingId: String(booking.id),
      amount: '1000.00',
      reference: 'BT-99417',
      status: 'cleared',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('DUPLICATE_REFERENCE');
  });

  it('allows the same reference in the other direction', async () => {
    await recordCleared({ amount: '1000.00', reference: 'INV-4471' });

    const response = await finance.as('post', '/payments').send({
      bookingId: String(booking.id),
      amount: '500.00',
      reference: 'INV-4471',
      direction: 'outgoing',
      status: 'cleared',
    });

    expect(response.status).toBe(201);
  });

  it('refuses an instalment that belongs to a different booking', async () => {
    const other = await priced('3000.00', { reference: 'TA-OTHER-1' });
    const schedule = await db.PaymentSchedule.create({
      bookingId: other.id,
      label: 'Deposit',
      dueOn: daysFromNow(7),
      currencyCode: 'AUD',
      amount: '500.00',
    });

    const response = await finance.as('post', '/payments').send({
      bookingId: String(booking.id),
      paymentScheduleId: String(schedule.id),
      amount: '500.00',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_SCHEDULE');
  });

  it('rejects an amount that is not money', async () => {
    const response = await finance
      .as('post', '/payments')
      .send({ bookingId: String(booking.id), amount: '1000.005' });

    expect(response.status).toBe(400);
    expect(response.body.error.details.amount).toBeDefined();
  });

  it('will not let the amount be edited afterwards', async () => {
    const payment = await recordCleared({ amount: '1000.00' });

    const response = await finance
      .as('patch', `/payments/${payment.id}`)
      .send({ amount: '2000.00' });

    expect(response.status).toBe(400);
  });
});

// --- Settling --------------------------------------------------------------

describe('settling a payment', () => {
  it('moves pending money into the balance when it clears', async () => {
    const created = await finance
      .as('post', '/payments')
      .send({ bookingId: String(booking.id), amount: '1000.00' });

    const response = await finance
      .as('post', `/payments/${created.body.data.payment.id}/settle`)
      .send({ status: 'cleared' });

    expect(response.status).toBe(200);
    expect(response.body.data.payment.status).toBe('cleared');
    expect(response.body.data.payment.clearedAt).toBeTruthy();
  });

  it('requires a reason when a payment fails', async () => {
    const created = await finance
      .as('post', '/payments')
      .send({ bookingId: String(booking.id), amount: '1000.00' });

    const response = await finance
      .as('post', `/payments/${created.body.data.payment.id}/settle`)
      .send({ status: 'failed' });

    expect(response.status).toBe(400);
    expect(response.body.error.details.reason).toBeDefined();
  });

  it('refuses to un-fail a payment — a resent transfer is a new entry', async () => {
    const payment = await recordCleared({ amount: '1000.00' });
    await finance
      .as('post', `/payments/${payment.id}/settle`)
      .send({ status: 'failed', reason: 'Dishonoured by the bank.' });

    const response = await finance
      .as('post', `/payments/${payment.id}/settle`)
      .send({ status: 'cleared' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('takes a refunded payment back out of the balance', async () => {
    const payment = await recordCleared({ amount: '1000.00' });
    await finance
      .as('post', `/payments/${payment.id}/settle`)
      .send({ status: 'refunded', reason: 'Trip shortened; one traveller withdrew.' });

    const response = await finance.as('get', `/payments/bookings/${booking.id}/summary`);

    expect(response.body.data.totals.received).toBe('0.00');
    expect(response.body.data.totals.refunded).toBe('1000.00');
    expect(response.body.data.totals.balance).toBe('8450.00');
  });

  it('tells the consultant and coordinator when money lands, but not the person who keyed it', async () => {
    await recordCleared({ amount: '1000.00' });

    const rows = await db.Notification.findAll({ where: { type: 'payment_received' } });
    const recipients = rows.map((row) => String(row.userId)).sort();

    expect(recipients).toEqual(
      [String(consultant.user.id), String(coordinator.user.id)].sort()
    );
    expect(recipients).not.toContain(String(finance.user.id));
  });

  it('warns the trip owners when a payment bounces', async () => {
    const payment = await recordCleared({ amount: '1000.00' });
    await finance
      .as('post', `/payments/${payment.id}/settle`)
      .send({ status: 'failed', reason: 'Dishonoured by the bank.' });

    const rows = await db.Notification.findAll({ where: { type: 'payment_failed' } });

    expect(rows).toHaveLength(2);
    expect(rows[0].severity).toBe('warning');
  });
});

// --- Reconciliation --------------------------------------------------------

describe('the booking summary', () => {
  it('reports the balance from cleared money only', async () => {
    await addSchedule('Deposit', daysFromNow(7), '1000.00');
    await recordCleared({ amount: '1000.00' });
    await finance
      .as('post', '/payments')
      .send({ bookingId: String(booking.id), amount: '500.00' });

    const response = await finance.as('get', `/payments/bookings/${booking.id}/summary`);
    const totals = response.body.data.totals;

    expect(totals.quoted).toBe('8450.00');
    expect(totals.received).toBe('1000.00');
    expect(totals.awaitingClearance).toBe('500.00');
    expect(totals.balance).toBe('7450.00');
    expect(totals.fullyPaid).toBe(false);
  });

  it('marks a booking fully paid only once the quoted total is covered', async () => {
    await recordCleared({ amount: '8450.00' });

    const response = await finance.as('get', `/payments/bookings/${booking.id}/summary`);

    expect(response.body.data.totals.fullyPaid).toBe(true);
    expect(response.body.data.totals.balance).toBe('0.00');
  });

  it('does not call an unpriced booking fully paid', async () => {
    const unpriced = await createBooking({ consultantId: consultant.user.id });

    const response = await finance.as('get', `/payments/bookings/${unpriced.id}/summary`);

    expect(response.body.data.totals.fullyPaid).toBe(false);
  });

  it('flags a plan that does not add up to the quoted price', async () => {
    await addSchedule('Deposit', daysFromNow(7), '1000.00');
    await addSchedule('Balance', daysFromNow(60), '6000.00');

    const response = await finance.as('get', `/payments/bookings/${booking.id}/summary`);

    expect(response.body.data.totals.planMatchesTotal).toBe(false);
    expect(response.body.data.totals.planShortfall).toBe('1450.00');
  });

  it('is satisfied when the plan matches the price exactly', async () => {
    await addSchedule('Deposit', daysFromNow(7), '1000.00');
    await addSchedule('Balance', daysFromNow(60), '7450.00');

    const response = await finance.as('get', `/payments/bookings/${booking.id}/summary`);

    expect(response.body.data.totals.planMatchesTotal).toBe(true);
    expect(response.body.data.totals.planShortfall).toBe('0.00');
  });

  it('does not chase an instalment that is late but already paid', async () => {
    const schedule = await addSchedule('Deposit', daysFromNow(-5), '1000.00');
    await recordCleared({ paymentScheduleId: schedule.id, amount: '1000.00' });

    const response = await finance.as('get', `/payments/bookings/${booking.id}/summary`);
    const row = response.body.data.schedules.find((s) => s.id === String(schedule.id));

    expect(row.pastDue).toBe(true);
    expect(row.settled).toBe(true);
    expect(row.overdue).toBe(false);
    expect(response.body.data.totals.overdueAmount).toBe('0.00');
  });

  it('chases only what is still owed on a part-paid instalment', async () => {
    const schedule = await addSchedule('Deposit', daysFromNow(-5), '1000.00');
    await recordCleared({ paymentScheduleId: schedule.id, amount: '400.00' });

    const response = await finance.as('get', `/payments/bookings/${booking.id}/summary`);
    const row = response.body.data.schedules.find((s) => s.id === String(schedule.id));

    expect(row.paid).toBe('400.00');
    expect(row.outstanding).toBe('600.00');
    expect(row.overdue).toBe(true);
    expect(response.body.data.totals.overdueAmount).toBe('600.00');
  });

  it('owes an instalment again after its payment is refunded', async () => {
    const schedule = await addSchedule('Deposit', daysFromNow(7), '1000.00');
    const payment = await recordCleared({ paymentScheduleId: schedule.id, amount: '1000.00' });
    await finance
      .as('post', `/payments/${payment.id}/settle`)
      .send({ status: 'refunded', reason: 'Traveller changed departure.' });

    const response = await finance.as('get', `/payments/bookings/${booking.id}/summary`);
    const row = response.body.data.schedules.find((s) => s.id === String(schedule.id));

    expect(row.paid).toBe('0.00');
    expect(row.outstanding).toBe('1000.00');
    expect(row.settled).toBe(false);
  });

  it('points at the next instalment still owed', async () => {
    const first = await addSchedule('Deposit', daysFromNow(7), '1000.00');
    await addSchedule('Balance', daysFromNow(60), '7450.00');
    await recordCleared({ paymentScheduleId: first.id, amount: '1000.00' });

    const response = await finance.as('get', `/payments/bookings/${booking.id}/summary`);

    expect(response.body.data.nextDue.label).toBe('Balance');
  });

  it('counts a waived instalment as owed by nobody', async () => {
    const schedule = await addSchedule('Late fee', daysFromNow(-5), '150.00');
    await finance
      .as('post', `/payments/schedules/${schedule.id}/close`)
      .send({ status: 'waived', reason: 'Goodwill.' });

    const response = await finance.as('get', `/payments/bookings/${booking.id}/summary`);

    expect(response.body.data.totals.overdueAmount).toBe('0.00');
    expect(response.body.data.totals.scheduled).toBe('0.00');
  });

  it('separates what went out to operators from what came in', async () => {
    await recordCleared({ amount: '8450.00' });
    await finance.as('post', '/payments').send({
      bookingId: String(booking.id),
      amount: '145000.00',
      currencyCode: 'NPR',
      exchangeRate: '0.01187500',
      direction: 'outgoing',
      status: 'cleared',
      reference: 'HA-8891',
    });

    const response = await finance.as('get', `/payments/bookings/${booking.id}/summary`);

    expect(response.body.data.totals.received).toBe('8450.00');
    expect(response.body.data.totals.paidOut).toBe('1721.88');
  });
});

// --- Paying operators ------------------------------------------------------

describe('paying a ground operator', () => {
  it('refuses to pay against an arrangement the operator has not confirmed', async () => {
    const confirmation = await unconfirmedArrangement();

    const response = await finance.as('post', '/payments').send({
      bookingId: String(booking.id),
      operatorConfirmationId: String(confirmation.id),
      amount: '50000.00',
      currencyCode: 'NPR',
      exchangeRate: '0.01187500',
      direction: 'outgoing',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CONFIRMATION_NOT_CONFIRMED');
  });

  it('allows it once they have confirmed', async () => {
    const confirmation = await unconfirmedArrangement();
    await confirmation.update({ status: 'confirmed', respondedAt: new Date() });

    const response = await finance.as('post', '/payments').send({
      bookingId: String(booking.id),
      operatorConfirmationId: String(confirmation.id),
      amount: '50000.00',
      currencyCode: 'NPR',
      exchangeRate: '0.01187500',
      direction: 'outgoing',
      status: 'cleared',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.payment.amountInBase).toBe('593.75');
  });
});

// --- The finance screens ---------------------------------------------------

describe('the chase list and dashboard', () => {
  it('leaves settled instalments out of what is outstanding', async () => {
    const paid = await addSchedule('Deposit', daysFromNow(-5), '1000.00');
    await addSchedule('Balance', daysFromNow(10), '7450.00');
    await recordCleared({ paymentScheduleId: paid.id, amount: '1000.00' });

    const response = await finance.as('get', '/payments/outstanding');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].label).toBe('Balance');
  });

  it('filters to overdue only on request', async () => {
    await addSchedule('Deposit', daysFromNow(-5), '1000.00');
    await addSchedule('Balance', daysFromNow(60), '7450.00');

    const response = await finance.as('get', '/payments/outstanding?overdueOnly=true');

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].label).toBe('Deposit');
  });

  it('drops a cancelled booking off the chase list', async () => {
    await addSchedule('Deposit', daysFromNow(-5), '1000.00');
    await booking.update({ status: 'cancelled', cancellationReason: 'Withdrew.' });

    const response = await finance.as('get', '/payments/outstanding');

    expect(response.body.data).toHaveLength(0);
  });

  it('groups what is owed by currency rather than adding across them', async () => {
    await addSchedule('Deposit', daysFromNow(-5), '1000.00');

    const nprBooking = await priced('300000.00', {
      reference: 'TA-NPR-1',
      currencyCode: 'NPR',
    });
    await db.PaymentSchedule.create({
      bookingId: nprBooking.id,
      label: 'Local costs',
      dueOn: daysFromNow(20),
      currencyCode: 'NPR',
      amount: '300000.00',
    });

    const response = await finance.as('get', '/payments/summary');
    const buckets = response.body.data.outstandingByCurrency;

    expect(buckets).toHaveLength(2);
    expect(buckets.find((b) => b.currencyCode === 'AUD').outstanding).toBe('1000.00');
    expect(buckets.find((b) => b.currencyCode === 'NPR').outstanding).toBe('300000.00');
    expect(response.body.data.overdueInstalments).toBe(1);
    expect(response.body.data.dueWithinFortnight).toBe(0);
  });

  it('counts payments still waiting to clear', async () => {
    await finance
      .as('post', '/payments')
      .send({ bookingId: String(booking.id), amount: '1000.00' });

    const response = await finance.as('get', '/payments/summary');

    expect(response.body.data.paymentsAwaitingClearance).toBe(1);
  });

  it('is closed to anyone not signed in', async () => {
    const { anon } = require('./helpers');
    const response = await anon('get', '/payments/summary');

    expect(response.status).toBe(401);
  });
});

// --- The reminder sweep -----------------------------------------------------

describe('payment reminders', () => {
  it('nudges the trip owners and finance about an instalment due soon', async () => {
    const outsider = await signIn({ role: 'finance' });
    await addSchedule('Balance', daysFromNow(3), '7450.00');

    const result = await paymentReminders.run();
    // consultant + coordinator + finance (from beforeEach) + outsider (also finance)
    expect(result.dueSoonNotified).toBe(4);

    for (const actor of [consultant, coordinator, finance]) {
      // eslint-disable-next-line no-await-in-loop
      const inbox = await inboxOf(actor);
      expect(inbox.map((row) => row.type)).toEqual(['payment_due_soon']);
      expect(inbox[0].body).toMatch(/Balance/);
    }
    // Every finance account hears about it, not just the one already used above.
    expect(await inboxOf(outsider)).toHaveLength(1);
  });

  it('leaves an instalment outside the reminder window alone', async () => {
    await addSchedule('Balance', daysFromNow(30), '7450.00');

    const result = await paymentReminders.run();
    expect(result.dueSoonNotified).toBe(0);
  });

  it('does not chase an instalment that is already fully paid', async () => {
    const schedule = await addSchedule('Deposit', daysFromNow(2), '1000.00');
    await recordCleared({ paymentScheduleId: schedule.id, amount: '1000.00' });

    const result = await paymentReminders.run();
    expect(result.dueSoonNotified).toBe(0);
  });

  it('nudges once about an overdue instalment, not once per sweep', async () => {
    await addSchedule('Deposit', daysFromNow(-4), '1000.00');
    await consultant.as('post', '/notifications/read-all');

    const first = await paymentReminders.run();
    expect(first.overdueNotified).toBe(3);

    // Sitting overdue for a second day is the same fact, not a new one.
    const second = await paymentReminders.run();
    expect(second.overdueNotified).toBe(0);

    const inbox = await inboxOf(consultant, '?status=unread');
    expect(inbox.map((row) => row.type)).toEqual(['payment_overdue']);
  });

  it('sends a fresh overdue nudge once the instalment is pushed out and misses its new date too', async () => {
    const schedule = await addSchedule('Deposit', daysFromNow(-1), '1000.00');
    await paymentReminders.run();
    await consultant.as('post', '/notifications/read-all');

    await consultant.as('patch', `/payments/schedules/${schedule.id}`).send({ dueOn: daysFromNow(-6) });

    const result = await paymentReminders.run();
    expect(result.overdueNotified).toBe(3);
    expect(await inboxOf(consultant, '?status=unread')).toHaveLength(1);
  });

  it('drops a cancelled booking off both reminder passes', async () => {
    await addSchedule('Deposit', daysFromNow(-4), '1000.00');
    await booking.update({ status: 'cancelled', cancellationReason: 'Withdrew.' });

    const result = await paymentReminders.run();
    expect(result.dueSoonNotified).toBe(0);
    expect(result.overdueNotified).toBe(0);
  });
});

// --- Local helpers ---------------------------------------------------------

const paymentReminders = require('../src/jobs/paymentReminders');

async function inboxOf(actor, query = '') {
  const response = await actor.as('get', `/notifications${query}`);
  return response.body.data;
}

async function addSchedule(label, dueOn, amount) {
  const response = await consultant
    .as('post', '/payments/schedules')
    .send({ bookingId: String(booking.id), label, dueOn, amount });
  if (response.status !== 201) {
    throw new Error(`Schedule setup failed (${response.status}): ${response.text}`);
  }
  return response.body.data.schedule;
}

async function recordCleared(payload) {
  const response = await finance.as('post', '/payments').send({
    bookingId: String(booking.id),
    status: 'cleared',
    ...payload,
  });
  if (response.status !== 201) {
    throw new Error(`Payment setup failed (${response.status}): ${response.text}`);
  }
  return response.body.data.payment;
}

/** A ground operator asked to do something, who has not yet answered. */
async function unconfirmedArrangement() {
  const destination = await createDestination();
  const { user: curator } = await createUser({ role: 'coordinator' });
  const operator = await db.Operator.create({
    destinationId: destination.id,
    name: 'Himalayan Ascent',
    type: 'guide',
    typicalResponseDays: 3,
    isActive: true,
    vettedAt: new Date(),
    vettedByUserId: curator.id,
  });
  return db.OperatorConfirmation.create({
    bookingId: booking.id,
    operatorId: operator.id,
    serviceType: 'guide',
    summary: 'Guides and porters, Lukla to base camp',
    status: 'requested',
    requestedAt: new Date(),
    currencyCode: 'NPR',
    amount: '145000.00',
  });
}
