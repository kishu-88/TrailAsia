'use strict';

const { db, resetDatabase, anon, createDestination, createUser, signIn } = require('./helpers');

beforeEach(resetDatabase);

describe('GET /public/destinations', () => {
  it('lists active destinations without any auth', async () => {
    await createDestination({ code: 'NP', name: 'Nepal' });
    await createDestination({ code: 'BT', name: 'Bhutan', isActive: false });

    const response = await anon('get', '/public/destinations');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].code).toBe('NP');
  });

  it('returns only marketing fields, not the staff shape', async () => {
    const destination = await createDestination();

    const response = await anon('get', `/public/destinations/${destination.id}`);

    expect(response.status).toBe(200);
    const body = response.body.data.destination;
    expect(body).toMatchObject({ code: 'NP', name: 'Nepal' });
    // documentRequirements is a staff-only include on GET /destinations/:id —
    // the public shape never carries it.
    expect(body.documentRequirements).toBeUndefined();
  });

  it('404s an inactive destination rather than exposing it', async () => {
    const destination = await createDestination({ isActive: false });
    const response = await anon('get', `/public/destinations/${destination.id}`);
    expect(response.status).toBe(404);
  });
});

describe('POST /public/booking-enquiries', () => {
  it('creates a new traveller, a booking in enquiry status, and an itinerary segment', async () => {
    const { user: consultant } = await createUser({ role: 'consultant' });
    const destination = await createDestination();

    const response = await anon('post', '/public/booking-enquiries').send({
      firstName: 'Priya',
      lastName: 'Shah',
      email: 'PRIYA@example.com',
      phone: '+61 400 000 000',
      destinationId: destination.id,
      departureDate: '2027-03-14',
      returnDate: '2027-04-04',
      partySize: 2,
      message: 'Keen on a March departure if possible.',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.enquiry.status).toBe('enquiry');
    expect(response.body.data.enquiry.reference).toMatch(/^TA-\d{4}-\d{4}$/);

    const traveller = await db.Traveller.findOne({ where: { email: 'priya@example.com' } });
    expect(traveller).toBeTruthy();
    expect(traveller.firstName).toBe('Priya');

    const booking = await db.Booking.findOne({ where: { reference: response.body.data.enquiry.reference } });
    expect(booking.status).toBe('enquiry');
    expect(booking.leadTravellerId).toBe(traveller.id);
    expect(booking.consultantId).toBe(consultant.id);
    expect(booking.partySize).toBe(2);
    expect(booking.notes).toBe('Keen on a March departure if possible.');

    const segments = await db.ItinerarySegment.findAll({ where: { bookingId: booking.id } });
    expect(segments).toHaveLength(1);
    expect(segments[0].destinationId).toBe(destination.id);

    const party = await db.BookingTraveller.findOne({
      where: { bookingId: booking.id, travellerId: traveller.id },
    });
    expect(party.isLead).toBe(true);
  });

  it('creates one itinerary segment per destination when additional destinations are given', async () => {
    await createUser({ role: 'consultant' });
    const lead = await createDestination({ code: 'NP', name: 'Nepal' });
    const extra = await createDestination({ code: 'BT', name: 'Bhutan' });

    const response = await anon('post', '/public/booking-enquiries').send({
      firstName: 'Priya',
      lastName: 'Shah',
      email: 'priya@example.com',
      destinationId: lead.id,
      additionalDestinationIds: [extra.id],
    });

    expect(response.status).toBe(201);
    const booking = await db.Booking.findOne({
      where: { reference: response.body.data.enquiry.reference },
    });
    const segments = await db.ItinerarySegment.findAll({
      where: { bookingId: booking.id },
      order: [['sequence', 'ASC']],
    });
    expect(segments).toHaveLength(2);
    expect(segments[0].destinationId).toBe(lead.id);
    expect(segments[1].destinationId).toBe(extra.id);
  });

  it('rejects an inactive additional destination', async () => {
    await createUser({ role: 'consultant' });
    const lead = await createDestination({ code: 'NP', name: 'Nepal' });
    const extra = await createDestination({ code: 'BT', name: 'Bhutan', isActive: false });

    const response = await anon('post', '/public/booking-enquiries').send({
      firstName: 'Priya',
      lastName: 'Shah',
      email: 'priya@example.com',
      destinationId: lead.id,
      additionalDestinationIds: [extra.id],
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_DESTINATION');
  });

  it('reuses the existing traveller record for a repeat enquiry by the same email', async () => {
    await createUser({ role: 'consultant' });
    const destination = await createDestination();

    const first = await anon('post', '/public/booking-enquiries').send({
      firstName: 'Priya',
      lastName: 'Shah',
      email: 'priya@example.com',
      destinationId: destination.id,
    });
    const second = await anon('post', '/public/booking-enquiries').send({
      firstName: 'Priya',
      lastName: 'Shah',
      email: 'priya@example.com',
      destinationId: destination.id,
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await db.Traveller.count({ where: { email: 'priya@example.com' } })).toBe(1);
    expect(await db.Booking.count()).toBe(2);
  });

  it('notifies the assigned consultant', async () => {
    const { user: consultant } = await createUser({ role: 'consultant' });
    const destination = await createDestination();

    await anon('post', '/public/booking-enquiries').send({
      firstName: 'Priya',
      lastName: 'Shah',
      email: 'priya@example.com',
      destinationId: destination.id,
    });

    const notification = await db.Notification.findOne({
      where: { userId: consultant.id, type: 'booking_enquiry_received' },
    });
    expect(notification).toBeTruthy();
  });

  it('falls back to an active admin when no consultant exists', async () => {
    const { user: admin } = await createUser({ role: 'admin' });
    const destination = await createDestination();

    const response = await anon('post', '/public/booking-enquiries').send({
      firstName: 'Priya',
      lastName: 'Shah',
      email: 'priya@example.com',
      destinationId: destination.id,
    });

    expect(response.status).toBe(201);
    const booking = await db.Booking.findOne({ where: { reference: response.body.data.enquiry.reference } });
    expect(booking.consultantId).toBe(admin.id);
  });

  it('rejects an unknown or inactive destination', async () => {
    await createUser({ role: 'consultant' });

    const response = await anon('post', '/public/booking-enquiries').send({
      firstName: 'Priya',
      lastName: 'Shah',
      email: 'priya@example.com',
      destinationId: '999999',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_DESTINATION');
  });

  it('validates required fields', async () => {
    await createUser({ role: 'consultant' });
    const destination = await createDestination();

    const response = await anon('post', '/public/booking-enquiries').send({
      email: 'not-an-email',
      destinationId: destination.id,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details.firstName).toBeTruthy();
    expect(response.body.error.details.lastName).toBeTruthy();
    expect(response.body.error.details.email).toBeTruthy();
  });

  it('rejects a return date before the departure date', async () => {
    await createUser({ role: 'consultant' });
    const destination = await createDestination();

    const response = await anon('post', '/public/booking-enquiries').send({
      firstName: 'Priya',
      lastName: 'Shah',
      email: 'priya@example.com',
      destinationId: destination.id,
      departureDate: '2027-03-14',
      returnDate: '2027-03-01',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details.returnDate).toBeTruthy();
  });

  it('is not reachable with a staff token missing — no auth is required or accepted as a bypass', async () => {
    // A staff bearer token is simply ignored on this router; the route works
    // identically with or without one, because it never calls `authenticate`.
    const { as } = await signIn({ role: 'consultant' });
    const destination = await createDestination();

    const response = await as('post', '/public/booking-enquiries').send({
      firstName: 'Priya',
      lastName: 'Shah',
      email: 'priya@example.com',
      destinationId: destination.id,
    });

    expect(response.status).toBe(201);
  });
});

describe('GET /public/destinations/:id — marketing fields', () => {
  it('includes marketing content and an empty testimonial list by default', async () => {
    const destination = await createDestination({
      summary: 'Trek to Everest Base Camp with local guides.',
      heroImageUrl: 'https://example.com/ebc.jpg',
      highlights: ['Sherpa-led guides', 'Everest Base Camp views'],
      durationDays: 14,
      priceFromAmount: '2500.00',
      priceFromCurrencyCode: 'AUD',
    });

    const response = await anon('get', `/public/destinations/${destination.id}`);

    expect(response.status).toBe(200);
    expect(response.body.data.destination).toMatchObject({
      summary: 'Trek to Everest Base Camp with local guides.',
      heroImageUrl: 'https://example.com/ebc.jpg',
      highlights: ['Sherpa-led guides', 'Everest Base Camp views'],
      durationDays: 14,
      priceFrom: { amount: '2500.00', currencyCode: 'AUD' },
    });
    expect(response.body.data.destination.testimonials).toEqual([]);
  });

  it('includes travel-guide content, defaulting an unset packing list to an empty array', async () => {
    const withGuide = await createDestination({
      code: 'NP',
      bestTimeToVisit: 'March–May and September–November',
      fitnessLevel: 'strenuous',
      whatToPack: ['Trekking boots', 'Thermal layers'],
      cultureNotes: 'Dress modestly in villages.',
    });
    const withoutGuide = await createDestination({ code: 'BT' });

    const withGuideResponse = await anon('get', `/public/destinations/${withGuide.id}`);
    expect(withGuideResponse.body.data.destination).toMatchObject({
      bestTimeToVisit: 'March–May and September–November',
      fitnessLevel: 'strenuous',
      whatToPack: ['Trekking boots', 'Thermal layers'],
      cultureNotes: 'Dress modestly in villages.',
    });

    const withoutGuideResponse = await anon('get', `/public/destinations/${withoutGuide.id}`);
    expect(withoutGuideResponse.body.data.destination).toMatchObject({
      bestTimeToVisit: null,
      fitnessLevel: null,
      whatToPack: [],
      cultureNotes: null,
    });
  });

  it('includes attractions and things-to-know, defaulting both to an empty array when unset', async () => {
    const withContent = await createDestination({
      code: 'NP',
      attractions: [{ name: 'Kathmandu Durbar Square', description: 'A UNESCO World Heritage site.' }],
      thingsToKnow: [{ label: 'Currency', value: 'Nepalese Rupee (NPR)' }],
    });
    const withoutContent = await createDestination({ code: 'BT' });

    const withContentResponse = await anon('get', `/public/destinations/${withContent.id}`);
    expect(withContentResponse.body.data.destination).toMatchObject({
      attractions: [{ name: 'Kathmandu Durbar Square', description: 'A UNESCO World Heritage site.' }],
      thingsToKnow: [{ label: 'Currency', value: 'Nepalese Rupee (NPR)' }],
    });

    const withoutContentResponse = await anon('get', `/public/destinations/${withoutContent.id}`);
    expect(withoutContentResponse.body.data.destination).toMatchObject({
      attractions: [],
      thingsToKnow: [],
    });
  });

  it('still returns real arrays when a JSON column holds JSON text instead of a parsed value', async () => {
    // Regression test for the September 2026 "blank destination page"
    // incident: in production, mysql2/Sequelize didn't reliably auto-parse a
    // native MySQL JSON column back into a JS array on read, so
    // `destination.highlights` came back as the literal string
    // '["Everest Base Camp views", ...]' instead of an array, and
    // `highlights.map(...)` on the client crashed the whole page.
    //
    // SQLite (what tests run against) always parses a single layer of JSON
    // text back to a value on its own, which would hide this bug if we only
    // wrote single-encoded text here — so this writes an *extra* layer of
    // encoding directly to the column (bypassing the model, the way a raw
    // `queryInterface.bulkUpdate` seed does) to force a real string past
    // SQLite's own parsing too, and confirms `Destination`'s getters
    // (`utils/json.js#parseJsonArray`) unwrap however many layers are there
    // rather than assuming exactly one.
    const destination = await createDestination({ code: 'NP' });
    await db.sequelize.query(
      'UPDATE destinations SET highlights = ?, what_to_pack = ?, attractions = ?, things_to_know = ? WHERE id = ?',
      {
        replacements: [
          JSON.stringify(JSON.stringify(['Everest Base Camp views', 'Sherpa-guided villages'])),
          JSON.stringify(JSON.stringify(['Trekking boots'])),
          JSON.stringify(
            JSON.stringify([{ name: 'Kathmandu Durbar Square', description: 'A UNESCO World Heritage site.' }])
          ),
          JSON.stringify(JSON.stringify([{ label: 'Currency', value: 'Nepalese Rupee (NPR)' }])),
          destination.id,
        ],
      }
    );

    const response = await anon('get', `/public/destinations/${destination.id}`);

    expect(response.status).toBe(200);
    expect(response.body.data.destination).toMatchObject({
      highlights: ['Everest Base Camp views', 'Sherpa-guided villages'],
      whatToPack: ['Trekking boots'],
      attractions: [{ name: 'Kathmandu Durbar Square', description: 'A UNESCO World Heritage site.' }],
      thingsToKnow: [{ label: 'Currency', value: 'Nepalese Rupee (NPR)' }],
    });
  });
});

describe('GET /public/testimonials', () => {
  it('returns published testimonials only, newest first', async () => {
    const destination = await createDestination();
    await db.Testimonial.create({
      destinationId: destination.id,
      authorName: 'Older Quote',
      quote: 'A trip of a lifetime.',
      isPublished: true,
    });
    await db.Testimonial.create({
      authorName: 'Draft Quote',
      quote: 'Not ready yet.',
      isPublished: false,
    });
    await db.Testimonial.create({
      authorName: 'Newer Quote',
      quote: 'The whole team looked after us.',
      isPublished: true,
    });

    const response = await anon('get', '/public/testimonials');

    expect(response.status).toBe(200);
    expect(response.body.data.map((row) => row.authorName)).toEqual([
      'Newer Quote',
      'Older Quote',
    ]);
  });

  it('narrows to one destination when asked', async () => {
    const destination = await createDestination();
    const other = await createDestination({ code: 'BT', name: 'Bhutan' });
    await db.Testimonial.create({
      destinationId: destination.id,
      authorName: 'Nepal Quote',
      quote: 'Loved it.',
    });
    await db.Testimonial.create({
      destinationId: other.id,
      authorName: 'Bhutan Quote',
      quote: 'Also loved it.',
    });

    const response = await anon('get', `/public/testimonials?destinationId=${destination.id}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].authorName).toBe('Nepal Quote');
  });
});
