'use strict';

const {
  db,
  resetDatabase,
  signIn,
  anon,
  createBooking,
  createDestination,
  daysFromNow,
} = require('./helpers');

/**
 * Reporting.
 *
 * The cases are grouped by the decision somebody would get wrong if the rule
 * were missing. A conversion rate with open enquiries in the denominator, a
 * revenue total that adds AUD to NPR, a league table a consultant can see —
 * each of those is a report that looks fine and misleads.
 */

let admin;
let finance;
let consultantA;
let consultantB;
let nepal;

/** A booking with a price, a status, and optionally an itinerary. */
async function booking({ consultant, status = 'enquiry', total = null, currency = 'AUD', destination = null, reference }) {
  const created = await createBooking({
    consultantId: consultant.user.id,
    reference,
    status: 'enquiry',
    departureDate: daysFromNow(60),
    returnDate: daysFromNow(80),
  });
  await created.update({
    status,
    totalAmount: total,
    currencyCode: currency,
    ...(status === 'cancelled' ? { cancellationReason: 'Traveller withdrew.' } : {}),
  });
  if (destination) {
    await db.ItinerarySegment.create({
      bookingId: created.id,
      destinationId: destination.id,
      sequence: 1,
      title: 'Leg one',
      startDate: daysFromNow(60),
      endDate: daysFromNow(70),
    });
  }
  return created;
}

beforeEach(async () => {
  await resetDatabase();
  admin = await signIn({ role: 'admin' });
  finance = await signIn({ role: 'finance' });
  consultantA = await signIn({ role: 'consultant', firstName: 'Kishor', lastName: 'Aryal' });
  consultantB = await signIn({ role: 'consultant', firstName: 'Pratik', lastName: 'Magar' });
  nepal = await createDestination();
});

// --- Access ----------------------------------------------------------------

describe('access', () => {
  it('is closed to anyone not signed in', async () => {
    expect((await anon('get', '/reports/commercial')).status).toBe(401);
    expect((await anon('get', '/reports/operational')).status).toBe(401);
  });

  it('lets every staff role read the operational tab', async () => {
    for (const actor of [admin, finance, consultantA]) {
      // eslint-disable-next-line no-await-in-loop
      const response = await actor.as('get', '/reports/operational');
      expect(response.status).toBe(200);
    }
  });
});

// --- The conversion rate ---------------------------------------------------

describe('pipeline and conversion', () => {
  it('leaves open enquiries out of the conversion denominator', async () => {
    await booking({ consultant: consultantA, status: 'confirmed', reference: 'TA-W1' });
    await booking({ consultant: consultantA, status: 'cancelled', reference: 'TA-L1' });
    // Three sitting in the pipeline. Counting these as losses would report 25%.
    await booking({ consultant: consultantA, status: 'enquiry', reference: 'TA-O1' });
    await booking({ consultant: consultantA, status: 'quoted', reference: 'TA-O2' });
    await booking({ consultant: consultantA, status: 'enquiry', reference: 'TA-O3' });

    const response = await admin.as('get', '/reports/commercial');
    const pipeline = response.body.data.pipeline;

    expect(pipeline.total).toBe(5);
    expect(pipeline.won).toBe(1);
    expect(pipeline.lost).toBe(1);
    expect(pipeline.stillOpen).toBe(3);
    expect(pipeline.decided).toBe(2);
    expect(pipeline.conversionRate).toBe(50);
  });

  it('reports no rate at all when nothing has been decided', async () => {
    await booking({ consultant: consultantA, status: 'enquiry', reference: 'TA-O1' });

    const response = await admin.as('get', '/reports/commercial');

    expect(response.body.data.pipeline.conversionRate).toBeNull();
  });

  it('counts a trip that ran and one that was cancelled after confirming, separately', async () => {
    await booking({ consultant: consultantA, status: 'completed', reference: 'TA-C1' });
    await booking({ consultant: consultantA, status: 'cancelled', reference: 'TA-X1' });

    const response = await admin.as('get', '/reports/commercial');

    expect(response.body.data.pipeline.won).toBe(1);
    expect(response.body.data.pipeline.lost).toBe(1);
  });

  it('breaks the pipeline value down by currency rather than adding across', async () => {
    await booking({ consultant: consultantA, status: 'confirmed', total: '8450.00', reference: 'TA-A1' });
    await booking({
      consultant: consultantA,
      status: 'confirmed',
      total: '300000.00',
      currency: 'NPR',
      reference: 'TA-N1',
    });

    const response = await admin.as('get', '/reports/commercial');
    const confirmed = response.body.data.pipeline.byStatus.find((r) => r.status === 'confirmed');

    expect(confirmed.count).toBe(2);
    expect(confirmed.value).toHaveLength(2);
    expect(confirmed.value.find((v) => v.currencyCode === 'AUD').total).toBe('8450.00');
    expect(confirmed.value.find((v) => v.currencyCode === 'NPR').total).toBe('300000.00');
  });
});

// --- Revenue by destination ------------------------------------------------

describe('revenue by destination', () => {
  it('attributes a trip to where it starts, once', async () => {
    const bhutan = await createDestination({ code: 'BT', name: 'Bhutan', countryCode: 'BT' });
    const created = await booking({
      consultant: consultantA,
      status: 'confirmed',
      total: '8450.00',
      destination: nepal,
      reference: 'TA-M1',
    });
    // A second leg in another country must not create a second revenue row.
    await db.ItinerarySegment.create({
      bookingId: created.id,
      destinationId: bhutan.id,
      sequence: 2,
      title: 'Paro extension',
      startDate: daysFromNow(71),
      endDate: daysFromNow(75),
    });

    const response = await admin.as('get', '/reports/commercial');
    const rows = response.body.data.destinations.rows;

    expect(rows).toHaveLength(1);
    expect(rows[0].leadDestination).toBe('Nepal');
    expect(rows[0].value).toBe('8450.00');
    expect(rows[0].bookings).toBe(1);
  });

  it('names won bookings it could not attribute instead of dropping them', async () => {
    await booking({ consultant: consultantA, status: 'confirmed', total: '5000.00', reference: 'TA-NI' });

    const response = await admin.as('get', '/reports/commercial');

    expect(response.body.data.destinations.rows).toHaveLength(0);
    expect(response.body.data.destinations.unattributedBookings).toBe(1);
  });

  it('leaves lost bookings out of revenue', async () => {
    await booking({
      consultant: consultantA,
      status: 'cancelled',
      total: '8450.00',
      destination: nepal,
      reference: 'TA-XL',
    });

    const response = await admin.as('get', '/reports/commercial');

    expect(response.body.data.destinations.rows).toHaveLength(0);
  });

  it('splits one destination into two rows when the currencies differ', async () => {
    await booking({ consultant: consultantA, status: 'confirmed', total: '8450.00', destination: nepal, reference: 'TA-D1' });
    await booking({
      consultant: consultantA,
      status: 'confirmed',
      total: '300000.00',
      currency: 'NPR',
      destination: nepal,
      reference: 'TA-D2',
    });

    const response = await admin.as('get', '/reports/commercial');
    const rows = response.body.data.destinations.rows;

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.currencyCode).sort()).toEqual(['AUD', 'NPR']);
  });
});

// --- Who sees whose numbers ------------------------------------------------

describe('consultant performance', () => {
  beforeEach(async () => {
    await booking({ consultant: consultantA, status: 'confirmed', total: '8450.00', reference: 'TA-A1' });
    await booking({ consultant: consultantA, status: 'cancelled', reference: 'TA-A2' });
    await booking({ consultant: consultantB, status: 'confirmed', total: '4000.00', reference: 'TA-B1' });
  });

  it('shows a manager the whole table', async () => {
    const response = await admin.as('get', '/reports/commercial');
    const consultants = response.body.data.consultants;

    expect(consultants.restricted).toBe(false);
    expect(consultants.rows).toHaveLength(2);
  });

  it('shows finance the whole table too — reconciliation needs it', async () => {
    const response = await finance.as('get', '/reports/commercial');

    expect(response.body.data.consultants.rows).toHaveLength(2);
  });

  it('shows a consultant only their own row', async () => {
    const response = await consultantA.as('get', '/reports/commercial');
    const consultants = response.body.data.consultants;

    expect(consultants.restricted).toBe(true);
    expect(consultants.rows).toHaveLength(1);
    expect(consultants.rows[0].consultantId).toBe(String(consultantA.user.id));
    expect(consultants.rows[0].name).toMatch(/Kishor/);
  });

  it('does not leak a colleague’s figures into the consultant’s own row', async () => {
    const response = await consultantA.as('get', '/reports/commercial');
    const row = response.body.data.consultants.rows[0];

    expect(row.created).toBe(2);
    expect(row.won).toBe(1);
    expect(row.lost).toBe(1);
    expect(row.conversionRate).toBe(50);
    expect(row.value.find((v) => v.currencyCode === 'AUD').total).toBe('8450.00');
  });

  it('still gives a consultant the agency-wide pipeline', async () => {
    // Only the performance comparison is private. Hiding the pipeline would
    // leave a consultant unable to see how busy the agency is.
    const response = await consultantA.as('get', '/reports/commercial');

    expect(response.body.data.pipeline.total).toBe(3);
  });
});

// --- Money in over time ----------------------------------------------------

describe('revenue timeline', () => {
  it('groups cleared money by the month it was received, not the month it was keyed', async () => {
    const trip = await booking({ consultant: consultantA, status: 'confirmed', total: '8450.00', reference: 'TA-T1' });
    await db.Payment.create({
      bookingId: trip.id,
      direction: 'incoming',
      method: 'bank_transfer',
      status: 'cleared',
      currencyCode: 'AUD',
      amount: '2000.00',
      baseCurrencyCode: 'AUD',
      exchangeRate: '1',
      amountInBase: '2000.00',
      receivedOn: daysFromNow(-40),
    });
    await db.Payment.create({
      bookingId: trip.id,
      direction: 'incoming',
      method: 'bank_transfer',
      status: 'cleared',
      currencyCode: 'AUD',
      amount: '1000.00',
      baseCurrencyCode: 'AUD',
      exchangeRate: '1',
      amountInBase: '1000.00',
      receivedOn: daysFromNow(-1),
    });

    const response = await admin.as('get', '/reports/commercial');
    const rows = response.body.data.timeline.rows;

    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.map((r) => r.received)).toContain('1000.00');
    expect(rows.every((r) => /^\d{4}-\d{2}$/.test(r.month))).toBe(true);
  });

  it('counts only cleared, incoming money', async () => {
    const trip = await booking({ consultant: consultantA, status: 'confirmed', total: '8450.00', reference: 'TA-T2' });
    const common = {
      bookingId: trip.id,
      method: 'bank_transfer',
      currencyCode: 'AUD',
      baseCurrencyCode: 'AUD',
      exchangeRate: '1',
      receivedOn: daysFromNow(-2),
    };
    await db.Payment.create({ ...common, direction: 'incoming', status: 'pending', amount: '500.00', amountInBase: '500.00' });
    await db.Payment.create({ ...common, direction: 'outgoing', status: 'cleared', amount: '700.00', amountInBase: '700.00' });

    const response = await admin.as('get', '/reports/commercial');

    expect(response.body.data.timeline.rows).toHaveLength(0);
  });
});

// --- Date range ------------------------------------------------------------

describe('the date range', () => {
  it('defaults to the last twelve months', async () => {
    const response = await admin.as('get', '/reports/commercial');
    const { from, to } = response.body.data.pipeline;

    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(from < to).toBe(true);
  });

  it('includes a booking created on the last day of the range', async () => {
    await booking({ consultant: consultantA, status: 'confirmed', reference: 'TA-E1' });
    const now = new Date().toISOString().slice(0, 10);

    const response = await admin.as('get', `/reports/commercial?from=${now}&to=${now}`);

    expect(response.body.data.pipeline.total).toBe(1);
  });

  it('refuses a range that runs backwards', async () => {
    const response = await admin.as(
      'get',
      `/reports/commercial?from=${daysFromNow(10)}&to=${daysFromNow(1)}`
    );

    expect(response.status).toBe(400);
    expect(response.body.error.details.to).toBeDefined();
  });

  it('rejects a date that is not a date', async () => {
    const response = await admin.as('get', '/reports/commercial?from=last-tuesday');

    expect(response.status).toBe(400);
  });
});

// --- The departure board ---------------------------------------------------

describe('departure readiness', () => {
  it('leaves out departures beyond the horizon', async () => {
    const soon = await createBooking({ consultantId: consultantA.user.id, reference: 'TA-S1', departureDate: daysFromNow(10), returnDate: daysFromNow(20) });
    await soon.update({ status: 'confirmed' });
    const later = await createBooking({ consultantId: consultantA.user.id, reference: 'TA-S2', departureDate: daysFromNow(200), returnDate: daysFromNow(210) });
    await later.update({ status: 'confirmed' });

    const response = await admin.as('get', '/reports/operational?horizonDays=30');
    const refs = response.body.data.departures.rows.map((r) => r.booking.reference);

    expect(refs).toContain('TA-S1');
    expect(refs).not.toContain('TA-S2');
  });

  it('leaves out bookings that are not going anywhere', async () => {
    const cancelled = await createBooking({ consultantId: consultantA.user.id, reference: 'TA-XC', departureDate: daysFromNow(10), returnDate: daysFromNow(20) });
    await cancelled.update({ status: 'cancelled', cancellationReason: 'Withdrew.' });

    const response = await admin.as('get', '/reports/operational');

    expect(response.body.data.departures.rows).toHaveLength(0);
  });

  it('does not call a booking ready when nothing has been arranged', async () => {
    const trip = await createBooking({ consultantId: consultantA.user.id, reference: 'TA-R1', departureDate: daysFromNow(10), returnDate: daysFromNow(20) });
    await trip.update({ status: 'confirmed', totalAmount: '5000.00' });

    const response = await admin.as('get', '/reports/operational');
    const row = response.body.data.departures.rows[0];

    expect(row.ready).toBe(false);
    expect(row.payments.ready).toBe(false);
    expect(response.body.data.departures.summary.paymentsBlocked).toBe(1);
  });

  it('does not call an unpriced booking paid for', async () => {
    const trip = await createBooking({ consultantId: consultantA.user.id, reference: 'TA-R2', departureDate: daysFromNow(10), returnDate: daysFromNow(20) });
    await trip.update({ status: 'confirmed', totalAmount: null });

    const response = await admin.as('get', '/reports/operational');

    expect(response.body.data.departures.rows[0].payments.ready).toBe(false);
  });

  it('counts a fully paid booking as settled', async () => {
    const trip = await createBooking({ consultantId: consultantA.user.id, reference: 'TA-R3', departureDate: daysFromNow(10), returnDate: daysFromNow(20) });
    await trip.update({ status: 'confirmed', totalAmount: '5000.00' });
    await db.Payment.create({
      bookingId: trip.id,
      direction: 'incoming',
      method: 'bank_transfer',
      status: 'cleared',
      currencyCode: 'AUD',
      amount: '5000.00',
      baseCurrencyCode: 'AUD',
      exchangeRate: '1',
      amountInBase: '5000.00',
      receivedOn: daysFromNow(-5),
    });

    const response = await admin.as('get', '/reports/operational');
    const row = response.body.data.departures.rows[0];

    expect(row.payments.received).toBe('5000.00');
    expect(row.payments.balance).toBe('0.00');
    expect(row.payments.ready).toBe(true);
  });

  it('says how the horizon was applied rather than truncating quietly', async () => {
    const response = await admin.as('get', '/reports/operational?horizonDays=45');

    expect(response.body.data.departures.horizonDays).toBe(45);
    expect(response.body.data.departures.capped).toBe(false);
    expect(response.body.data.departures.limit).toBeGreaterThan(0);
  });
});

// --- Everything past its date ----------------------------------------------

describe('overdue across modules', () => {
  it('gathers late work from three modules into one answer', async () => {
    const trip = await createBooking({ consultantId: consultantA.user.id, reference: 'TA-OD', departureDate: daysFromNow(20), returnDate: daysFromNow(30) });
    await trip.update({ status: 'confirmed', totalAmount: '5000.00' });

    await db.Task.create({
      bookingId: trip.id,
      title: 'Chase the insurance certificate',
      status: 'open',
      dueOn: daysFromNow(-3),
    });

    const operator = await db.Operator.create({
      destinationId: nepal.id,
      name: 'Himalayan Ascents',
      type: 'guide',
      typicalResponseDays: 3,
      vettedAt: new Date(),
      vettedByUserId: admin.user.id,
    });
    await db.OperatorConfirmation.create({
      bookingId: trip.id,
      operatorId: operator.id,
      serviceType: 'guide',
      summary: 'Guides and porters',
      status: 'requested',
      requestedAt: new Date(),
      dueBy: daysFromNow(-4),
    });

    await db.PaymentSchedule.create({
      bookingId: trip.id,
      label: 'Deposit',
      dueOn: daysFromNow(-6),
      currencyCode: 'AUD',
      amount: '1000.00',
    });

    const response = await admin.as('get', '/reports/operational');
    const overdue = response.body.data.overdue;

    expect(overdue.counts.tasks).toBe(1);
    expect(overdue.counts.operatorConfirmations).toBe(1);
    expect(overdue.counts.instalments).toBe(1);
    expect(overdue.tasks[0].daysLate).toBe(3);
    expect(overdue.instalments[0].outstanding).toBe('1000.00');
  });

  it('does not chase an instalment that is late but already paid', async () => {
    const trip = await createBooking({ consultantId: consultantA.user.id, reference: 'TA-OP', departureDate: daysFromNow(20), returnDate: daysFromNow(30) });
    await trip.update({ status: 'confirmed', totalAmount: '1000.00' });
    const schedule = await db.PaymentSchedule.create({
      bookingId: trip.id,
      label: 'Deposit',
      dueOn: daysFromNow(-6),
      currencyCode: 'AUD',
      amount: '1000.00',
    });
    await db.Payment.create({
      bookingId: trip.id,
      paymentScheduleId: schedule.id,
      direction: 'incoming',
      method: 'bank_transfer',
      status: 'cleared',
      currencyCode: 'AUD',
      amount: '1000.00',
      baseCurrencyCode: 'AUD',
      exchangeRate: '1',
      amountInBase: '1000.00',
      receivedOn: daysFromNow(-6),
    });

    const response = await admin.as('get', '/reports/operational');

    expect(response.body.data.overdue.counts.instalments).toBe(0);
  });

  it('ignores late work on a cancelled booking', async () => {
    const trip = await createBooking({ consultantId: consultantA.user.id, reference: 'TA-OC', departureDate: daysFromNow(20), returnDate: daysFromNow(30) });
    await trip.update({ status: 'cancelled', cancellationReason: 'Withdrew.' });
    await db.PaymentSchedule.create({
      bookingId: trip.id,
      label: 'Deposit',
      dueOn: daysFromNow(-6),
      currencyCode: 'AUD',
      amount: '1000.00',
    });

    const response = await admin.as('get', '/reports/operational');

    expect(response.body.data.overdue.counts.instalments).toBe(0);
  });
});

// --- Partner reliability ---------------------------------------------------

describe('operator reliability', () => {
  it('reports an unproven operator as unproven, not as failing', async () => {
    await db.Operator.create({
      destinationId: nepal.id,
      name: 'New Partner',
      type: 'guide',
      typicalResponseDays: 3,
    });

    const response = await admin.as('get', '/reports/operational');
    const row = response.body.data.operators.rows.find((r) => r.name === 'New Partner');

    expect(row.total).toBe(0);
    expect(row.confirmationRate).toBeNull();
    expect(row.averageResponseDays).toBeNull();
  });

  it('rates a partner on what they answered, not on what is still in flight', async () => {
    const trip = await createBooking({ consultantId: consultantA.user.id, reference: 'TA-OR', departureDate: daysFromNow(40), returnDate: daysFromNow(50) });
    const operator = await db.Operator.create({
      destinationId: nepal.id,
      name: 'Namche Lodges',
      type: 'accommodation',
      typicalResponseDays: 7,
      vettedAt: new Date(),
      vettedByUserId: admin.user.id,
    });
    const base = { bookingId: trip.id, operatorId: operator.id, serviceType: 'accommodation' };
    await db.OperatorConfirmation.create({ ...base, summary: 'Yes', status: 'confirmed', requestedAt: new Date(Date.now() - 2 * 864e5), respondedAt: new Date() });
    await db.OperatorConfirmation.create({ ...base, summary: 'No', status: 'declined', requestedAt: new Date(Date.now() - 2 * 864e5), respondedAt: new Date(), declineReason: 'No stock.' });
    // Unanswered: must not drag the rate down.
    await db.OperatorConfirmation.create({ ...base, summary: 'Waiting', status: 'requested', requestedAt: new Date() });

    const response = await admin.as('get', '/reports/operational');
    const row = response.body.data.operators.rows.find((r) => r.name === 'Namche Lodges');

    expect(row.total).toBe(3);
    expect(row.outstanding).toBe(1);
    expect(row.confirmationRate).toBe(50);
  });

  it('counts unvetted partners, because they cannot be given work', async () => {
    await db.Operator.create({ destinationId: nepal.id, name: 'Unvetted One', type: 'guide' });
    await db.Operator.create({
      destinationId: nepal.id,
      name: 'Vetted One',
      type: 'guide',
      vettedAt: new Date(),
      vettedByUserId: admin.user.id,
    });

    const response = await admin.as('get', '/reports/operational');

    expect(response.body.data.operators.unvetted).toBe(1);
  });
});

// --- Task throughput -------------------------------------------------------

describe('task throughput', () => {
  it('reports raised against closed, and what is still open', async () => {
    const trip = await createBooking({ consultantId: consultantA.user.id, reference: 'TA-TT', departureDate: daysFromNow(40), returnDate: daysFromNow(50) });

    await db.Task.create({ bookingId: trip.id, title: 'Open one', status: 'open', dueOn: daysFromNow(5) });
    await db.Task.create({ bookingId: trip.id, title: 'Late one', status: 'open', dueOn: daysFromNow(-2) });
    await db.Task.create({
      bookingId: trip.id,
      title: 'Finished one',
      status: 'done',
      completedAt: new Date(),
    });

    const response = await admin.as('get', '/reports/operational');
    const tasks = response.body.data.tasks;

    expect(tasks.raised).toBe(3);
    expect(tasks.closed).toBe(1);
    expect(tasks.openNow).toBe(2);
    expect(tasks.overdueNow).toBe(1);
    expect(tasks.averageDaysToClose).not.toBeNull();
  });

  it('reports no average when nothing has been closed', async () => {
    const response = await admin.as('get', '/reports/operational');

    expect(response.body.data.tasks.closed).toBe(0);
    expect(response.body.data.tasks.averageDaysToClose).toBeNull();
  });

  it('accounts for rows it could not place in a month', async () => {
    const trip = await createBooking({ consultantId: consultantA.user.id, reference: 'TA-UD', departureDate: daysFromNow(40), returnDate: daysFromNow(50) });
    await db.Task.create({ bookingId: trip.id, title: 'One', status: 'done', completedAt: new Date() });

    const response = await admin.as('get', '/reports/operational');
    const tasks = response.body.data.tasks;
    const charted = tasks.rows.reduce((sum, row) => sum + row.closed, 0);

    // Whatever the chart shows plus whatever it could not place must equal the
    // total. A chart that silently drops rows is worse than one that says so.
    expect(charted + tasks.undatedRows).toBe(tasks.closed);
  });
});

/**
 * The guard that keeps a bad timestamp from taking down a whole tab.
 *
 * `new Date(x).toISOString()` throws a RangeError on an unparseable value. It
 * did, on real data, and it cost the departure board, the overdue list and the
 * partner table as well — none of which had anything to do with the offending
 * task. A report reads data other code wrote, including data written before the
 * current rules existed, so it has to survive a bad row rather than fall over.
 */
describe('the month-key guard', () => {
  const { monthKey } = require('../src/services/report.service');

  it('places a real timestamp in its month', () => {
    expect(monthKey('2026-03-14T02:00:00.000Z')).toBe('2026-03');
    expect(monthKey(new Date('2026-12-31T23:00:00.000Z'))).toBe('2026-12');
  });

  it('returns null rather than throwing on anything it cannot read', () => {
    for (const value of [null, undefined, '', 'not-a-date', 'last Tuesday', {}, NaN]) {
      expect(monthKey(value)).toBeNull();
    }
  });

  it('does not quietly turn a missing date into 1970', () => {
    // `new Date(null)` is the epoch, which is a *valid* date — so a naive
    // implementation files every undated row under January 1970 and the chart
    // grows a phantom column nobody can explain.
    expect(monthKey(null)).not.toBe('1970-01');
  });
});

// --- The dashboard's headline ----------------------------------------------

describe('the headline figures', () => {
  it('returns the pipeline and the departure summary, and nothing heavy', async () => {
    await booking({ consultant: consultantA, status: 'confirmed', reference: 'TA-H1' });

    const response = await admin.as('get', '/reports/headline');

    expect(response.status).toBe(200);
    expect(response.body.data.pipeline.won).toBe(1);
    expect(response.body.data.departures).toHaveProperty('readyOnAllThree');
    // The full row sets belong to the tabs, not the landing screen.
    expect(response.body.data.pipeline.byStatus).toBeUndefined();
    expect(response.body.data.departures.rows).toBeUndefined();
  });
});
